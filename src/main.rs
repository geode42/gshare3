use std::{collections::HashMap, fs, io::{self, Write}, net::{IpAddr, SocketAddr}, os::unix::fs::MetadataExt, path::{self, Path, PathBuf}, process, str::FromStr, sync::{Arc, Mutex}, thread, time::{Duration, Instant, UNIX_EPOCH}};
use axum::{body::Body, extract::{ConnectInfo, DefaultBodyLimit, Multipart, Query, Request, State}, http::{header::{self, CACHE_CONTROL}, HeaderValue, Response, StatusCode, Uri}, response::{Html, IntoResponse}, routing::get, Json, Router};
use askama_axum::Template;
use chrono::Local;
use cli::{get_args, DirectoryListingViewType};
use serde::{Deserialize, Serialize};
use tower::{ServiceBuilder, ServiceExt};
use tower_http::{compression::CompressionLayer, services::ServeFile};
use local_ip_address::local_ip;

mod cli;

fn encode_url_spaces<S: AsRef<str>>(url: S) -> String {
    url.as_ref().replace(" ", "%20")
}

fn unencode_url_spaces<S: AsRef<str>>(url: S) -> String {
    url.as_ref().replace("%20", " ")
}

// font used across the website
const WEBSITE_FONT: &[u8; 93824] = include_bytes!("JetBrainsMono-Medium.woff2");

/* --------------------------- Directory Template --------------------------- */
#[derive(Serialize, Deserialize, Debug)]
struct PathComponent {
    name: String,
    url: String,
}

#[derive(Serialize, Deserialize, Debug)]
struct EntryData {
    name: String,
    url: String,
    directory: bool,
    size: Option<u64>,
    modified: f32,
}

#[derive(Serialize, Deserialize, Debug)]
struct PageData {
    title: String,
    path_components: Vec<PathComponent>,
    entries: Vec<EntryData>,
    upload_enabled: bool,
    upload_overwrite: bool,
    virtual_directory: bool,
    default_view: DirectoryListingViewType,
}

#[derive(Template)]
#[template(path = "directory/directory.jinja")]
struct DirectoryTemplate {
    data: PageData,
}

/* ------------------------ Not Whitelisted Template ------------------------ */
#[derive(Template)]
#[template(path = "not-whitelisted.jinja")]
struct NotWhitelistedTemplate {
    client_ip: String,
}

/* ------------------------------ 404 Template ------------------------------ */
#[derive(Template)]
#[template(path = "404.jinja")]
struct NotFoundTemplate {
    directory: bool,
}

/* -------------------------------- App State ------------------------------- */
#[derive(Debug, Clone)]
struct AppState {
    whitelisted_ips: Vec<IpAddr>,
    paths: Vec<PathBuf>,
    upload: bool,
    upload_overwrite: bool,
    directory_sizes: Arc<Mutex<HashMap<PathBuf, u64>>>,
    default_view: DirectoryListingViewType,
    title: Option<String>,
}

#[tokio::main]
async fn main() {
    let args = get_args();

    /* --------------------------- Get paths and IP's --------------------------- */
    let mut whitelisted_ips = Vec::new();
    let mut paths = args.paths.clone().into_iter().map(|i| path::absolute(i).unwrap()).collect::<Vec<PathBuf>>();

    for arg in args.paths_and_ips {
        if let Ok(ip) = IpAddr::from_str(&arg) {
            whitelisted_ips.push(ip);
        } else {
            paths.push(path::absolute(PathBuf::from(&arg)).unwrap())
        }
    }

    // add the current working directory if there're no paths, ensures paths always has a length of at least 1
    if paths.is_empty() {
        paths.push(path::absolute(PathBuf::from(".")).unwrap());
    }

    let paths_that_dont_exist = paths.iter().filter(|i| !i.exists()).collect::<Vec<&PathBuf>>();
    if !paths_that_dont_exist.is_empty() {
        for path in paths_that_dont_exist {
            eprintln!("\x1b[91mFile or directory not found: {}", path.to_str().unwrap());
        }
        process::exit(1);
    }

    let state = AppState {
        whitelisted_ips,
        paths: paths.clone(),
        upload: args.upload,
        upload_overwrite: args.upload_overwrite,
        directory_sizes: Arc::new(Mutex::new(HashMap::new())),
        default_view: args.default_view,
        title: args.title,
    };

    /* ----------------------------- Directory Sizes ---------------------------- */
    fn add_directory_size_recursive(path: PathBuf, directory_sizes_hashmap: &mut Arc<Mutex<HashMap<PathBuf, u64>>>) -> u64 {
        if path.is_symlink() { return 0 }
        if path.is_file() {
            return path.metadata().unwrap().size()
        }
        if let Some(&size) = directory_sizes_hashmap.clone().lock().unwrap().get(&path) {
            return size
        }
        let Ok(read_dir) = fs::read_dir(&path) else { return 0 };
        let mut size: u64 = 0;
        for entry in read_dir {
            let entry = entry.unwrap();
            // I'm guessing file_type can fail for symlinks?
            if let Ok(file_type) = entry.file_type() {
                if file_type.is_file() {
                    size += entry.metadata().unwrap().size();
                } else {
                    size += add_directory_size_recursive(entry.path(), directory_sizes_hashmap);
                }
            }
        }

        directory_sizes_hashmap.clone().lock().unwrap().insert(path, size);
        size
    }

    let mut state_directory_sizes_but_better = state.directory_sizes.clone();
    if !args.no_directory_sizes {
        // get directory sizes in a separate thread so you don't have to wait before accessing the website
        thread::spawn(move || {
            for path in paths {
                add_directory_size_recursive(path, &mut state_directory_sizes_but_better);
            }
        });
    }

    /* --------------------------------- Router --------------------------------- */
    let app = Router::new()
        .route("/",
            get(get_request_handler)
            .post(upload_handler)
        )
        .route("/*path",
            get(get_request_handler)
            .post(upload_handler)
        )
        .layer(
            ServiceBuilder::new()
                .layer(DefaultBodyLimit::disable())
                .map_response(|mut i: Response<Body>| {
                    i.headers_mut().insert(CACHE_CONTROL, HeaderValue::from_static("no-store"));
                    i
                })
        )
        .with_state(state)
        .layer(CompressionLayer::new());

    /* ------------------------------- Host Server ------------------------------ */
    let local_ip_addr = local_ip().unwrap();
    
    let addr_net = if args.private { "127.0.0.1" } else { "0.0.0.0"};
    let mut addr_host = args.port;
    let listener = loop {
        let addr = format!("{}:{}", addr_net, addr_host);
        match tokio::net::TcpListener::bind(&addr).await {
            Ok(listener) => break listener,
            Err(error) => match error.kind() {
                io::ErrorKind::AddrInUse => {
                    if args.no_port_increment {
                        eprintln!("\x1b[91mPort \x1b[96m{}\x1b[91m already in use", args.port);
                        process::exit(1);
                    }
                    addr_host += 1
                },
                e => panic!("{}", e),
            }
        }
    };

    let server_started_prefix_string = if args.private {
        "Started a \x1b[95mprivate\x1b[0m server at "
    } else {
        "Server started at "
    };

    let upload_suffix_string = if args.upload {
        " with \x1b[95mupload \x1b[92m(new files only)\x1b[0m"
    } else if args.upload_overwrite {
        " with \x1b[91mupload+overwrite\x1b[0m"
    } else {
        ""
    };
    // localhost has http:// because VSCode (a common enough editor) doesn't
    // think it's a url otherwise, but I imagine if you're starting a public
    // server you want to get the simplest url you can tell to others, hence
    // it doesn't have the http
    // PS: this is unintentionally the most perfectly aligned text I have ever written
    println!("{}\x1b[96m{}{}:{addr_host}\x1b[0m{}{}",
        server_started_prefix_string,
        if args.private { String::from("http://localhost") } else { local_ip_addr.to_string() },
        if addr_host == args.port { "" } else { "\x1b[95m" },
        upload_suffix_string,
        if addr_host == args.port { String::new() } else { format!(" \x1b[2m(:{} already in use)\x1b[0m", args.port) }
    );
    axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>()).await.unwrap();
}

/// Returns a boolean value indicating whether the IP is whitelisted
fn ip_authorized(state: &AppState, ip: &IpAddr) -> bool {
    state.whitelisted_ips.is_empty() || state.whitelisted_ips.contains(&ip) || ip.is_loopback() || *ip == local_ip().unwrap()
}

/* ------------------------ Figuring out request path ----------------------- */
// this code figures out which of these enum variants the server should respond with
// if the path is "/" and you have a virtual directory (meaning paths isn't just a single directory), you should serve the virtual directory
// otherwise you serve a file or a directory,
// unless the path isn't found
#[derive(Clone, Debug, PartialEq, Eq)]
enum FiguredOutRequestPath {
    VirtualDirectory,
    Directory(PathBuf),
    File(PathBuf),
    NotFound,
}

fn figure_out_request_path<S: AsRef<str>>(state: &AppState, request_path: S) -> FiguredOutRequestPath {
    let request_path = request_path.as_ref();
    // virtual directory fileserver
    if state.paths.len() > 1 || state.paths[0].is_file() {
        if request_path == "" || request_path == "/" {
            return FiguredOutRequestPath::VirtualDirectory;
        }
        let mut request_path_components = request_path.split('/').filter(|i| !i.is_empty()).collect::<Vec<&str>>();
        // todo: change this to a bad request or a redirect or something
        if request_path_components.contains(&"..") {
            return FiguredOutRequestPath::NotFound;
        }
        let request_top_level_path_component = request_path_components.remove(0);
        let server_top_level_path = match state.paths.clone().into_iter().find(|i| i.file_name().unwrap().to_str().unwrap() == request_top_level_path_component) {
            Some(path) => path,
            None => return FiguredOutRequestPath::NotFound,
        };
        let final_path = if request_path_components.is_empty() {
            server_top_level_path
        } else {
            server_top_level_path.join(request_path_components.iter().collect::<PathBuf>())
        };
        let directory_requested = request_path.ends_with('/');
        if directory_requested && final_path.is_dir() {
            return FiguredOutRequestPath::Directory(final_path)
        }
        if !directory_requested && final_path.is_file() {
            return FiguredOutRequestPath::File(final_path)
        }
        return FiguredOutRequestPath::NotFound;
    }

    // single directory fileserver
    let root_directory = &state.paths[0];
    let request_path_components = request_path.split('/').filter(|i| !i.is_empty()).collect::<Vec<&str>>();
    // todo: change this to a bad request or a redirect or something
    if request_path_components.contains(&"..") {
        return FiguredOutRequestPath::NotFound;
    }
    let final_path = root_directory.join(request_path_components.iter().collect::<PathBuf>());
    let directory_requested = request_path.ends_with('/');
    if directory_requested && final_path.is_dir() {
        return FiguredOutRequestPath::Directory(final_path)
    }
    if !directory_requested && final_path.is_file() {
        return FiguredOutRequestPath::File(final_path)
    }
    return FiguredOutRequestPath::NotFound;
}

#[derive(Deserialize)]
struct GetRequestQuery {
    data: bool,
}

async fn get_request_handler(ConnectInfo(addr): ConnectInfo<SocketAddr>, State(state): State<AppState>, request: Request) -> impl IntoResponse {
    let query: Result<Query<GetRequestQuery>, _> = Query::try_from_uri(request.uri());
    let is_data_request = query.is_ok_and(|i| i.data);
    // font is always served because it's used in not-whitelisted page
    // todo: use get_unique_path to always get unique resources dir
    if request.uri().path() == "/gshare3-resources/JetBrainsMono-Medium.woff2" && !is_data_request {
        return (
            [
                (header::CONTENT_TYPE, "font/woff2"),
            ],
            WEBSITE_FONT,
        ).into_response()
    }

    if !ip_authorized(&state, &addr.ip()) {
        println!("\x1b[2m{} \x1b[0;96m{}\x1b[0;2m tried to connect but isn't whitelisted\x1b[0m", Local::now().format("%H:%M:%S"), addr.ip());
        let template = NotWhitelistedTemplate { client_ip: addr.ip().to_string() };
        return (
            StatusCode::UNAUTHORIZED,
            [
                (header::CONTENT_TYPE, "text/html"),
            ],
            template.render().unwrap()
        ).into_response();
    }

    
    let request_path = unencode_url_spaces(request.uri().path());
    let figured_out_path = figure_out_request_path(&state, &request_path);
    if figured_out_path == FiguredOutRequestPath::NotFound {
        println!("\x1b[2m{} \x1b[0;96m{}\x1b[91m {}\x1b[0m", Local::now().format("%H:%M:%S"), addr.ip(), request_path);
        return (
            StatusCode::NOT_FOUND,
            [
                (header::CONTENT_TYPE, "text/html"),
            ],
            NotFoundTemplate { directory: request_path.ends_with("/") }.render().unwrap()
        ).into_response()
    }
    if let FiguredOutRequestPath::File(path) = figured_out_path {
        if is_data_request {
            return StatusCode::NOT_IMPLEMENTED.into_response()
        }
        println!("\x1b[2m{} \x1b[0;96m{}\x1b[92m {}\x1b[0m", Local::now().format("%H:%M:%S"), addr.ip(), request_path);
        return ServeFile::new(path).oneshot(request).await.unwrap().into_response()
    }
    // a directory is returned
    let mut entry_paths = Vec::new();
    if let FiguredOutRequestPath::Directory(path) = &figured_out_path {
        // todo: gray-out the folder if you can't read it
        if let Ok(entries) = fs::read_dir(path) {
            for entry in entries {
                let entry = entry.unwrap();
                if ["..", "."].contains(&entry.file_name().to_str().unwrap()) {
                    continue;
                }
                entry_paths.push(entry.path());
            }
        }
    } else {
        entry_paths.extend(state.paths.clone().into_iter());
    }

    // attempts to mimic ls's sorting, which seems to ignore case but places lowercase first if it comes to it
    entry_paths.sort_unstable_by_key(|i| {
        let filename = i.file_name().unwrap().to_str().unwrap();
        let filename_inverted_case = filename.chars().map(|i| if i.is_lowercase() { i.to_uppercase().to_string() } else { i.to_lowercase().to_string() }).collect::<String>();
        filename.to_lowercase().to_string() + &filename_inverted_case
    });

    let path_component_names = request_path.split('/').filter(|i| !i.is_empty()).collect::<Vec<&str>>();
    let mut path_components = Vec::new();
    path_components.push(if state.paths.len() > 1 || state.paths[0].is_file() {
        PathComponent { name: String::from("Virtual Directory"), url: String::from("/") }
    } else {
        PathComponent { name: String::from("Root Directory"), url: String::from("/") }
    });

    let mut entries = Vec::new();
    for path in entry_paths {
        if path.is_symlink() {
            continue;
        }
        let name = path.file_name().unwrap().to_string_lossy().to_string();
        let metadata = path.metadata().unwrap();
        if path.is_dir() {
            entries.push(EntryData {
                name: name.clone(),
                url: if !is_data_request {
                    encode_url_spaces(name.clone() + "/")
                } else {
                    encode_url_spaces(String::from("/") + &path_component_names.join("/") + if path_component_names.is_empty() {""} else {"/"} + &name.clone() + "/")
                },
                directory: true,
                size: state.directory_sizes.clone().lock().unwrap().get(&path).and_then(|i| Some(i.clone())),
                modified: metadata.modified().unwrap().duration_since(UNIX_EPOCH).unwrap().as_secs_f32(),
            })
        } else {
            entries.push(EntryData {
                name: name.clone(),
                url: if !is_data_request {
                    encode_url_spaces(name.clone())
                } else {
                    encode_url_spaces(String::from("/") + &path_component_names.join("/") + if path_component_names.is_empty() {""} else {"/"} + &name.clone())
                },
                directory: false,
                size: Some(metadata.size()),
                modified: metadata.modified().unwrap().duration_since(UNIX_EPOCH).unwrap().as_secs_f32(),
            })
        }
    }

    fn wrap_empty_string_in_quotation_marks<S: AsRef<str>>(string: S) -> String {
        let string = string.as_ref().to_string();
        if string.trim().is_empty() {
            format!("\"{string}\"")
        } else {
            string
        }
    }

    for (index, name) in path_component_names.iter().enumerate() {
        path_components.push(PathComponent {
            name: wrap_empty_string_in_quotation_marks(name.to_string()),
            url: String::from("/") + &path_component_names[..=index].join("/") + "/"
        });
    }

    let title = wrap_empty_string_in_quotation_marks(path_component_names.last().unwrap_or(&state.title.unwrap_or(String::from("gshare3")).as_str()).to_string());

    let data = PageData {
        title,
        path_components,
        entries,
        upload_enabled: state.upload || state.upload_overwrite,
        upload_overwrite: state.upload_overwrite,
        virtual_directory: figured_out_path == FiguredOutRequestPath::VirtualDirectory,
        default_view: state.default_view,
    };

    println!("\x1b[2m{} \x1b[0;96m{}\x1b[92m {}\x1b[0m", Local::now().format("%H:%M:%S"), addr.ip(), request_path);
    if !is_data_request {
        Html(DirectoryTemplate { data }.render().unwrap()).into_response()
    } else {
        Json(data).into_response()
    }
}

fn get_unique_path<P>(path: &P) -> PathBuf where P: AsRef<Path> {
    let path = path.as_ref().to_path_buf();
    if !path.exists() { return path }
    let stem = path.file_stem().unwrap().to_str().unwrap();
    let extension = match path.extension() {
        Some(extension) => String::from(".") + extension.to_str().unwrap(),
        None => String::new(),
    };
    let mut n = 1;
    loop {
        let new_path = path.with_file_name(format!("{stem} ({n}){extension}"));
        if !new_path.exists() { return new_path }
        n += 1;
    }
}

async fn upload_handler(ConnectInfo(addr): ConnectInfo<SocketAddr>, State(state): State<AppState>, uri: Uri, mut multipart: Multipart) -> impl IntoResponse {
    let request_path = uri.path();
    if !ip_authorized(&state, &addr.ip()) {
        println!("\x1b[2m{} \x1b[0;96m{}\x1b[0;2m somehow tried to upload while not being whitelisted\x1b[0m", Local::now().format("%H:%M:%S"), addr.ip());
        let template = NotWhitelistedTemplate { client_ip: addr.ip().to_string() };
        return (
            StatusCode::UNAUTHORIZED,
            [
                (header::CONTENT_TYPE, "text/html"),
            ],
            template.render().unwrap()
        ).into_response();
    }
    if !(state.upload || state.upload_overwrite) {
        return StatusCode::METHOD_NOT_ALLOWED.into_response()
    }

    let figured_out_request_path = figure_out_request_path(&state, request_path);
    let upload_directory = match figured_out_request_path {
        FiguredOutRequestPath::VirtualDirectory => {
            println!("\x1b[2m{} \x1b[0;96m{}\x1b[91m tried to upload to a file somehow\x1b[0m", Local::now().format("%H:%M:%S"), addr.ip());
            return StatusCode::METHOD_NOT_ALLOWED.into_response()
        },
        FiguredOutRequestPath::File(_) => {
            println!("\x1b[2m{} \x1b[0;96m{}\x1b[91m tried to upload to the virtual directory somehow\x1b[0m", Local::now().format("%H:%M:%S"), addr.ip());
            return StatusCode::METHOD_NOT_ALLOWED.into_response()
        },
        FiguredOutRequestPath::NotFound => {
            println!("\x1b[2m{} \x1b[0;96m{}\x1b[91m {}\x1b[0m", Local::now().format("%H:%M:%S"), addr.ip(), request_path);
            return StatusCode::NOT_FOUND.into_response()
        },
        FiguredOutRequestPath::Directory(path) => path,
    };

    let mut new_filenames = Vec::new();
    while let Ok(Some(mut field)) = multipart.next_field().await {
        let filename = field.file_name().unwrap().to_string();
        let path = upload_directory.join(&filename);
        let path = if !state.upload_overwrite {
            // really the unique path should be obtained when the file is
            // opened below to avoid the race condition but then I
            // wouldn't have a nice function and this is fine
            get_unique_path(&path)
        } else {
            path.to_path_buf()
        };
        let new_filename = path.file_name().unwrap().to_str().unwrap();
        new_filenames.push(new_filename.to_string());

        println!("\x1b[2m{} \x1b[0;96m{}\x1b[95m Uploading to {}\x1b[0m", Local::now().format("%H:%M:%S"), addr.ip(), request_path.to_string() + &new_filename);
        
        let start_time = Instant::now();
        let mut file = if state.upload_overwrite {
            fs::OpenOptions::new().write(true).create(true).truncate(true).open(&path).unwrap()
        } else {
            fs::OpenOptions::new().write(true).create_new(true).truncate(true).open(&path).unwrap()
        };
        while let Some(chunk) = field.chunk().await.unwrap() {
            file.write_all(&chunk).unwrap();
        }
        if start_time.elapsed() >= Duration::from_secs(10) {
            println!("\x1b[2m{} \x1b[0;96m{}\x1b[95m Completed upload to {}\x1b[0m", Local::now().format("%H:%M:%S"), addr.ip(), request_path.to_string() + &new_filename);
        }
    }
    return (
        StatusCode::CREATED,
        [
            (header::CONTENT_TYPE, "application/json"),
        ],
        serde_json::to_string(&new_filenames).unwrap()
    ).into_response()
}
