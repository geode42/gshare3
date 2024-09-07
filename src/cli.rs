use std::path::PathBuf;
use clap::{Parser, ValueEnum};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, ValueEnum, Serialize, Deserialize)]
#[serde(rename_all="kebab-case")]
pub enum DirectoryListingViewType {
	Grid,
	List,
	CompactList,
}

#[derive(Parser, Debug, Clone)]
#[command(version, about, long_about = None)]
pub struct Args {
	/// Files/dirs served and IP addresses that can access the website
	pub paths_and_ips: Vec<String>,

	/// Allow clients to upload *new* files
	#[arg(short, long, conflicts_with="upload_overwrite")]
	pub upload: bool,

	/// Allow clients to upload files and overwrite existing files
	#[arg(short='o', long, conflicts_with="upload")]
	pub upload_overwrite: bool,

	/// Manually set the paths if they're composed of ip addresses or something
	#[arg(long)]
	pub paths: Vec<PathBuf>,

	/// Set the port for the web server
	#[arg(short='p', long, default_value="8000")]
	pub port: u16,

	/// Disable trying new ports if the requested one is taken
	#[arg(long)]
	pub no_port_increment: bool,

	/// Serve on localhost (only you can access the website)
	#[arg(long)]
	pub private: bool,

	/// Disable recursive directory size finding
	#[arg(long="no-dir-sizes")]
	pub no_directory_sizes: bool,

	/// Set the default directory listing view
	#[arg(short='v', long, default_value="grid")]
	pub default_view: DirectoryListingViewType,

	/// Set the tab title when no item is open
	#[arg(short, long)]
	pub title: Option<String>,
}

pub fn get_args() -> Args {
	Args::parse()
}
