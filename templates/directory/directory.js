/**
 * @typedef { { name: string, url: string, directory: boolean, size?: number, modified: number } } EntryData
 */
/** @type { { title: string, path_components: { name: string, url: string }[], entries: EntryData[], upload_enabled: boolean, upload_overwrite: boolean, virtual_directory: boolean, default_view: string } } */
let data = JSON.parse(`{{ data|json|safe }}`)

/* ------------------------- createElement function ------------------------- */
// {% raw %}
/**
 * Created from VSCode's HTMLElementTagNameMap (used by its document.createElement documentation)
 * @typedef { "a" | "abbr" | "address" | "area" | "article" | "aside" | "audio" | "b" | "base" | "bdi" | "bdo" | "blockquote" | "body" | "br" | "button" | "canvas" | "caption" | "cite" | "code" | "col" | "colgroup" | "data" | "datalist" | "dd" | "del" | "details" | "dfn" | "dialog" | "div" | "dl" | "dt" | "em" | "embed" | "fieldset" | "figcaption" | "figure" | "footer" | "form" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "head" | "header" | "hgroup" | "hr" | "html" | "i" | "iframe" | "img" | "input" | "ins" | "kbd" | "label" | "legend" | "li" | "link" | "main" | "map" | "mark" | "menu" | "meta" | "meter" | "nav" | "noscript" | "object" | "ol" | "optgroup" | "option" | "output" | "p" | "picture" | "pre" | "progress" | "q" | "rp" | "rt" | "ruby" | "s" | "samp" | "script" | "search" | "section" | "select" | "slot" | "small" | "source" | "span" | "strong" | "style" | "sub" | "summary" | "sup" | "table" | "tbody" | "td" | "template" | "textarea" | "tfoot" | "th" | "thead" | "time" | "title" | "tr" | "track" | "u" | "ul" | "var" | "video" | "wbr" } HTMLElementTagNames
 * @typedef {{
 *     class?: string | string[],
 *     id?: string,
 *     text?: string,
 *     html?: string,
 *     children?: HTMLElement | HTMLElement[],
 *     parent?: HTMLElement,
 *     prepend?: HTMLElement,
 *     insertBefore?: HTMLElement,
 *     js?: (element) => unknown | ((element) => unknown)[],
 *     style?: string | Record<string, string>,
 *     ns?: string,
 *     is?: string,
 * }} CreateElementOptions
 */

/**
 * Returns an HTML element
 * 
 * Arguments are `tagname, options, ...children`, any and all can be omitted
 * 
 * Alternatively, a single string of HTML can be given, which will be parsed and returned
 * @param { [] | string | [HTMLElementTagNames] | [CreateElementOptions] | [HTMLElementTagNames, CreateElementOptions] } args
 * @returns { HTMLElement }
 */
function createElement(...args) {
	if (args.length == 1 && typeof args[0] == 'string' && args[0].includes('<')) {
		return new DOMParser().parseFromString(args[0], 'text/html').body.childNodes[0]
	}
	const tagname = typeof args[0] == 'string' ? args.shift() : 'div'
	const options = (typeof args[0] == 'object' && !(args[0] instanceof HTMLElement)) ? args.shift() : {}
	const children = args
	const element = options.ns != null ? document.createElementNS(options.ns, tagname, options.is != null ? { is: options.is } : {}) : document.createElement(tagname, options.is != null ? { is: options.is } : {})
	/** @type { [string, any][] } */
	const optionEntries = Object.entries(options).toSorted(([a], [b]) => {
		// js runs on the completed element, so it always goes at the end
		if (a == 'js') return 1
		if (b == 'js') return -1
		// like js custom keys go after the named keys
		const namedKeys = ['class', 'id', 'text', 'html', 'parent', 'prepend', 'insertBefore', 'js', 'style', 'ns', 'is']
		if (namedKeys.includes(a) && !namedKeys.includes(b)) return -1
		if (namedKeys.includes(b) && !namedKeys.includes(a)) return 1
		return 0
	})
	if (optionEntries.includes('text') && optionEntries.includes('html')) throw new Error("The \"text\" and \"html\" keys can't be used together")
	if (optionEntries.includes('parent') + optionEntries.includes('prepend') + optionEntries.includes('insertBefore') > 1) throw new Error("The \"parent\", \"prepend\", and \"insertBefore\" keys can't be used together")
	for (const [key, value] of optionEntries) {
		if (value == null) continue
		switch (key) {
			case 'class':
				// null checks for both null and undefined because js
				// this filter exists so that you could conditionally add classes (and js below) really easily without needing to do array weirdness, and if you wanted the functionality String() is still an option
				Array.isArray(value) ? element.className = value.filter(i => i != null).join(' ') : element.className = value
				break
			case 'id':
				element.id = value
				break
			case 'text':
				element.textContent = value
				break
			case 'html':
				element.innerHTML = value
				break
			case 'parent':
				value.append(element)
				break
			case 'prepend':
				value.prepend(element)
				break
			case 'insertBefore':
				value.parentElement.insertBefore(element, value)
				break
			case 'js':
				Array.isArray(value) ? value.filter(i => i != null).forEach(i => i(element)) : value(element)
				break
			case 'style':
				typeof value == 'object' ? Object.assign(element.style, value) : element.style = value
				break
			case 'ns':
				break
			default:
				element[key] = value
				break
		}
	}

	children.filter(i => i != null).forEach(i => element.append(i))

	return element
}
// {% endraw %}


/* ---------------------------------- Misc ---------------------------------- */
const icons = {
	folder: () => createElement('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor"><path d="M175.38-200q-23.05 0-39.22-16.19Q120-232.38 120-255.38v-449.24q0-23 16.16-39.19Q152.33-760 175.38-760h217.93l70.77 70.77h320.54q23 0 39.19 16.19Q840-656.85 840-633.85v378.47q0 23-16.19 39.19Q807.62-200 784.62-200H175.38Zm0-30.77h609.24q10.76 0 17.69-6.92 6.92-6.93 6.92-17.69v-378.47q0-10.77-6.92-17.69-6.93-6.92-17.69-6.92H452.15l-70.77-70.77h-206q-10.76 0-17.69 6.92-6.92 6.93-6.92 17.69v449.24q0 10.76 6.92 17.69 6.93 6.92 17.69 6.92Zm-24.61 0V-729.23-230.77Z"/></svg>'),
	draft: () => createElement('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor"><path d="M255.38-120q-23.05 0-39.22-16.16Q200-152.33 200-175.38v-609.24q0-23.05 16.16-39.22Q232.33-840 255.38-840h334.08L760-669.46v494.08q0 23.05-16.16 39.22Q727.67-120 704.62-120H255.38Zm318.7-535.54v-153.69h-318.7q-9.23 0-16.92 7.69-7.69 7.69-7.69 16.92v609.24q0 9.23 7.69 16.92 7.69 7.69 16.92 7.69h449.24q9.23 0 16.92-7.69 7.69-7.69 7.69-16.92v-480.16H574.08ZM230.77-809.23v153.69-153.69 658.46-658.46Z"/></svg>'),
	gridView: () => createElement('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor"><path d="M140-520v-300h300v300H140Zm0 380v-300h300v300H140Zm380-380v-300h300v300H520Zm0 380v-300h300v300H520ZM200-580h180v-180H200v180Zm380 0h180v-180H580v180Zm0 380h180v-180H580v180Zm-380 0h180v-180H200v180Zm380-380Zm0 200Zm-200 0Zm0-200Z"/></svg>'),
	viewList: () => createElement('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor"><path d="M350-240h437.69q4.62 0 8.46-3.85 3.85-3.84 3.85-8.46V-357H350v117ZM160-603h130v-117H172.31q-4.62 0-8.46 3.85-3.85 3.84-3.85 8.46V-603Zm0 187h130v-127H160v127Zm12.31 176H290v-117H160v104.69q0 4.62 3.85 8.46 3.84 3.85 8.46 3.85ZM350-416h450v-127H350v127Zm0-187h450v-104.69q0-4.62-3.85-8.46-3.84-3.85-8.46-3.85H350v117ZM172.31-180Q142-180 121-201q-21-21-21-51.31v-455.38Q100-738 121-759q21-21 51.31-21h615.38Q818-780 839-759q21 21 21 51.31v455.38Q860-222 839-201q-21 21-51.31 21H172.31Z"/></svg>'),
	tableRowsNarrow: () => createElement('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor"><path d="M760-355v-95H200v95h560Zm0-155v-95H200v95h560Zm0-155v-82.69q0-5.39-3.46-8.85t-8.85-3.46H212.31q-5.39 0-8.85 3.46t-3.46 8.85V-665h560ZM212.31-140Q182-140 161-161q-21-21-21-51.31v-535.38Q140-778 161-799q21-21 51.31-21h535.38Q778-820 799-799q21 21 21 51.31v535.38Q820-182 799-161q-21 21-51.31 21H212.31ZM760-212.31V-295H200v82.69q0 5.39 3.46 8.85t8.85 3.46h535.38q5.39 0 8.85-3.46t3.46-8.85Z"/></svg>'),
	arrowUpwardAlt: () => createElement('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor"><path d="M450-253.85v-381.84l-154 154-42.15-42.16L480-750l226.15 226.15L664-481.69l-154-154v381.84h-60Z"/></svg>'),
	arrowDownwardAlt: () => createElement('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor"><path d="M480-253.85 253.85-480 296-522.15l154 154V-750h60v381.85l154-154L706.15-480 480-253.85Z"/></svg>'),
	sortByAlpha: () => createElement('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor"><path d="m92.31-288.46 149.23-383.08h63.69l148.46 383.08h-63.54l-34.76-95.23H190.61l-35.07 95.23H92.31Zm116.92-147.08h125.54l-59.54-166.92H270l-60.77 166.92Zm347.23 147.08v-56.77l205.08-272H564.46v-54.31h265.08v56.77l-203.85 272h205.85v54.31H556.46ZM369.23-763.85 480-874.61l110.77 110.76H369.23ZM480-85.39 369.23-196.15h221.54L480-85.39Z"/></svg>'),
	schedule: () => createElement('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor"><path d="m618.92-298.92 42.16-42.16L510-492.16V-680h-60v212.15l168.92 168.93ZM480.07-100q-78.84 0-148.21-29.92t-120.68-81.21q-51.31-51.29-81.25-120.63Q100-401.1 100-479.93q0-78.84 29.92-148.21t81.21-120.68q51.29-51.31 120.63-81.25Q401.1-860 479.93-860q78.84 0 148.21 29.92t120.68 81.21q51.31 51.29 81.25 120.63Q860-558.9 860-480.07q0 78.84-29.92 148.21t-81.21 120.68q-51.29 51.31-120.63 81.25Q558.9-100 480.07-100ZM480-480Zm0 320q133 0 226.5-93.5T800-480q0-133-93.5-226.5T480-800q-133 0-226.5 93.5T160-480q0 133 93.5 226.5T480-160Z"/></svg>'),
	storage: () => createElement('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor"><path d="M134.62-168.46v-143.08h690.76v143.08H134.62Zm70.77-35.39h72.3v-72.3h-72.3v72.3Zm-70.77-444.61v-143.08h690.76v143.08H134.62Zm70.77-35.39h72.3v-72.3h-72.3v72.3Zm-70.77 275.39v-143.08h690.76v143.08H134.62Zm70.77-35.39h72.3v-72.3h-72.3v72.3Z"/></svg>'),
	chevron_right: () => createElement('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor"><path d="M504-480 320-664l56-56 240 240-240 240-56-56 184-184Z"/></svg>'),
}

const topBarContainer = document.getElementById('top-bar')
const pathWrapper = document.getElementById('path-wrapper')
const main = document.querySelector('main')

const pointerDownJSAnchor = anchorElement => {
	anchorElement.addEventListener('pointerdown', e => {
		if (e.buttons != 1 || e.pointerType != 'mouse') return
		if (anchorElement.href.endsWith('/')) {
			goToPath(anchorElement.href)
		} else {
			createElement('a', { href: anchorElement.href, download: '' }).click()
		}
	})
	anchorElement.addEventListener('click', e => {
		e.preventDefault()
		if (anchorElement.href.endsWith('/')) {
			goToPath(anchorElement.href)
		} else {
			createElement('a', { href: anchorElement.href, download: '' }).click()
		}
	})
}

[...pathWrapper.getElementsByTagName('a')].forEach(i => pointerDownJSAnchor(i))

/* ------------------------- Update top bar no stick ------------------------ */
function updateTopBarSticky() {
	const topBarHeight = topBarContainer.getBoundingClientRect().height
	const minPortionForNoStick = 0.2
	topBarContainer.classList.toggle('no-sticky', topBarHeight / innerHeight >= minPortionForNoStick)
}

new ResizeObserver(updateTopBarSticky).observe(document.body)
new MutationObserver(updateTopBarSticky).observe(topBarContainer, { subtree: true, childList: true })

/* -------------------------------------------------------------------------- */
/*                               File Uploading                               */
/* -------------------------------------------------------------------------- */

const notificationContainer = createElement({ id: 'notifications', parent: document.body })

async function uploadFiles(files = [], url = '') {
	if (!files.length) {
		// Only supports Chrome :(
		// files = await showOpenFilePicker({ multiple: true })

		// why is chrome asking me if i want to open the file in read-only ahhh
		// how do i make it always read only
		// i don't think i can i think i just suffer
		const fileInput = createElement('input', { type: 'file', multiple: 'true' })
		await new Promise(r => {
			fileInput.onchange = () => r()
			fileInput.click()
		})
		files = fileInput.files
	}
	// This is so much easier than making an html form, appending stuff to it, etc. how did I not know of this
	const formData = new FormData()
	;[...files].map(i => formData.append('file', i))

	const     progressDisplayContainer = createElement({ class: 'progress-display',           parent: notificationContainer })
	const         progressDisplayLabel = createElement({ class: 'label', text: files[0].name, parent: progressDisplayContainer })
	const progressDisplayTimeRemaining = createElement({ class: 'time-remaining',             parent: progressDisplayContainer })
	const           progressDisplayBar = createElement({ class: 'bar',                        parent: progressDisplayContainer })
	const  progressDisplayBarCompleted = createElement({ class: 'bar-completed',              parent: progressDisplayBar })

	let uploadStartTime = Date.now()

	// xhr is used to get upload progress, which isn't available everywhere with fetch
	const xhr = new XMLHttpRequest()
	xhr.responseType = 'json'
	xhr.upload.addEventListener('progress', e => {
		progressDisplayBarCompleted.style.width = `${e.loaded / e.total * 100}%`
		const secondsRemaining = ((Date.now() - uploadStartTime) / 1000) / e.loaded * (e.total - e.loaded)
		if (secondsRemaining >= 3600 * 24) {
			const days = Math.floor(secondsRemaining / (3600 * 24))
			const hours = Math.floor(secondsRemaining % (3600 * 24) / 3600)
			progressDisplayTimeRemaining.textContent = hours > 0 ? `${Math.floor(days)}days ${Math.floor(hours)}hr` : `${Math.ceil(hours)}hr`
		} else if (secondsRemaining >= 3600) {
			const hours = Math.floor(secondsRemaining / 3600)
			const minutes = Math.floor(secondsRemaining % 3600 / 60)
			progressDisplayTimeRemaining.textContent = minutes > 0 ? `${Math.floor(hours)}hr ${Math.floor(minutes)}m` : `${Math.ceil(hours)}hr`
		} else if (secondsRemaining >= 60) {
			progressDisplayTimeRemaining.textContent = `${Math.ceil(secondsRemaining / 60)}m`
		} else {
			progressDisplayTimeRemaining.textContent = `${Math.ceil(secondsRemaining)}s`
		}
	})
	xhr.addEventListener('loadend', () => {
		progressDisplayContainer.remove()
	})
	xhr.addEventListener('load', () => {
		if (url == '') {
			const newFilenames = xhr.response
			data.entries.splice(0, data.entries.length, ...data.entries.filter(i => !newFilenames.includes(i.name)))
			data.entries.push(...[...files].map(file => ({ name: file.name, url: file.name, directory: false, size: file.size })).map((i, index) => { i.name = newFilenames[index]; return i }))
			changeDataSortingAndUpdate()
		}
	})
	xhr.open('POST', url, true)
	xhr.send(formData)
}

/* -------------------------------- No Upload ------------------------------- */
let noUploadMessage = createElement({ text: (data.virtual_directory && data.upload_enabled) ? "Enter a real directory first, you're in a virtual directory right now" : "Uploading isn't enabled", id: 'no-upload-message' })
let noUploadMessageFadeOutTimeout
const noUploadMessageFadeOutAnimation = new Animation(new KeyframeEffect(noUploadMessage, { opacity: 0 }, 500))

noUploadMessageFadeOutAnimation.addEventListener('finish', () => {
	noUploadMessage.remove()
})

const showNoUploadMessage = () => {
	clearTimeout(noUploadMessageFadeOutTimeout)
	noUploadMessageFadeOutAnimation.pause(), noUploadMessageFadeOutAnimation.currentTime = 0

	noUploadMessage.textContent = (data.virtual_directory && data.upload_enabled) ? "Enter a real directory first, you're in a virtual directory right now" : "Uploading isn't enabled"
	document.body.append(noUploadMessage)
}

const hideNoUploadMessage = async (delay = undefined) => {
	clearTimeout(noUploadMessageFadeOutTimeout)
	
	delay = delay ?? (data.virtual_directory ? 3500 : 700)
	noUploadMessageFadeOutTimeout = setTimeout(() => (noUploadMessageFadeOutAnimation.currentTime = 0, noUploadMessageFadeOutAnimation.play()), delay)
}

/* ----------------------------- Event Listeners ---------------------------- */
document.addEventListener('dragover', e => {
	e.preventDefault()
	if (data.upload_enabled && !data.virtual_directory) document.body.classList.add('dragging')
	else showNoUploadMessage()
}, false)

document.addEventListener('dragleave', e => {
	if (data.upload_enabled && !data.virtual_directory) document.body.classList.remove('dragging')
	else hideNoUploadMessage()
}, false)

document.addEventListener('dragend', e => {
	if (data.virtual_directory || !data.upload_enabled) hideNoUploadMessage()
}, false)

document.addEventListener('dblclick', e => {
	if (![document.body, main, entryContainer, topBarContainer, pathWrapper, topRightControls].includes(e.target)) return
	if (data.upload_enabled && !data.virtual_directory) {
		uploadFiles()
	} else {
		showNoUploadMessage()
		hideNoUploadMessage(data.virtual_directory ? 3500 : 1500)
	}
}, false)

document.addEventListener('drop', e => {
	e.preventDefault()
	if (data.upload_enabled && !data.virtual_directory) {
		setTimeout(() => document.body.classList.remove('dragging'))
		uploadFiles(e.dataTransfer.files)
	} else {
		hideNoUploadMessage()
	}
})

// prevent double clicks from selecting text
document.addEventListener('mousedown', e => {
	if (![document.body, main, entryContainer, topBarContainer, pathWrapper, topRightControls].includes(e.target)) return
	if (e.detail > 1) {
		e.preventDefault()
	}
}, false)

const entryContainer = document.getElementById('entries')

const makeAnchorDragAndDroppableIfNecessary = entryAnchor => {
	if (!data.upload_enabled) return
	if (!entryAnchor.href.endsWith('/')) return
	entryAnchor.addEventListener('dragover', e => {
		e.stopPropagation()
		e.preventDefault()
		entryAnchor.classList.add('dragging')
		hideNoUploadMessage(0)
	})
	entryAnchor.addEventListener('dragleave', e => {
		entryAnchor.classList.remove('dragging')
	})
	entryAnchor.addEventListener('drop', e => {
		e.stopPropagation()
		e.preventDefault()
		setTimeout(() => entryAnchor.classList.remove('dragging'))
		uploadFiles(e.dataTransfer.files, entryAnchor.href)
	})
}

/* -------------------------------------------------------------------------- */
/*                                    Views                                   */
/* -------------------------------------------------------------------------- */

function getHumanReadableFileSize(bytes) {
	// you gotta' be prepared for the future, yk?
	const suffixes = new Map([
		['QB', 30],
		['RB', 27],
		['YB', 24],
		['ZB', 21],
		['EB', 18],
		['PB', 15],
		['TB', 12],
		['GB', 9],
		['MB', 6],
		['kB', 3],
	])
	for (const [suffix, exponent] of suffixes) {
		if (Math.log10(bytes) >= exponent) return `${Math.floor(bytes / Math.pow(10, exponent) * 100) / 100} ${suffix}`
	}
	return `${bytes} B`
}

let currentView = data.default_view
const minWidthForFourColumns = 738
if (currentView == 'grid' && innerWidth < minWidthForFourColumns) currentView = 'list'


function setGridView() {
	entryContainer.replaceChildren()
	entryContainer.classList.remove('list-view', 'compact-list-view')
	entryContainer.classList.add('grid-view')
	currentView = 'grid'

	data.entries.filter(i => i.directory).map(({ name, url, directory, size }) => {
		const li = createElement('li', { parent: entryContainer })
		const a = createElement('a', { href: url, parent: li, js: [pointerDownJSAnchor, makeAnchorDragAndDroppableIfNecessary] }, icons.folder(), createElement({ text: name }))
	})
	data.entries.filter(i => !i.directory).map(({ name, url, directory, size }) => {
		const li = createElement('li', { parent: entryContainer })
		const a = createElement('a', { download: '', href: url, parent: li, js: [pointerDownJSAnchor, makeAnchorDragAndDroppableIfNecessary] }, icons.draft(), createElement({ text: name }))
	})
}

function setListView() {
	entryContainer.replaceChildren()
	entryContainer.classList.remove('grid-view', 'compact-list-view')
	entryContainer.classList.add('list-view')
	currentView = 'list'

	data.entries.filter(i => i.directory).map(({ name, url, directory, size, modified }) => {
		const li = createElement('li', { parent: entryContainer })
		const a = createElement('a', { href: url, parent: li, js: [pointerDownJSAnchor, makeAnchorDragAndDroppableIfNecessary] },
			icons.folder(),
			createElement(
				createElement({ text: name, class: 'name' }),
				...((size != null) ? [createElement({ text: size ? getHumanReadableFileSize(size) : 'empty', class: 'size' })] : []),
			)
		)
	})
	data.entries.filter(i => !i.directory).map(({ name, url, directory, size, modified }) => {
		const li = createElement('li', { parent: entryContainer })
		const a = createElement('a', { download: '', href: url, parent: li, js: [pointerDownJSAnchor, makeAnchorDragAndDroppableIfNecessary] },
			icons.draft(),
			createElement(
				createElement({ text: name, class: 'name' }),
				createElement({ text: size ? getHumanReadableFileSize(size) : 'empty', class: 'size' }),
			),
		)
	})
}

function setCompactListView() {
	entryContainer.replaceChildren()
	entryContainer.classList.remove('grid-view', 'list-view')
	entryContainer.classList.add('compact-list-view')
	currentView = 'compact-list'

	data.entries.filter(i => i.directory).map(({ name, url, directory, size }) => {
		const li = createElement('li', { parent: entryContainer })
		const a = createElement('a', { href: url, text: name + '/', parent: li, js: [pointerDownJSAnchor, makeAnchorDragAndDroppableIfNecessary] })
	})
	data.entries.filter(i => !i.directory).map(({ name, url, directory, size }) => {
		const li = createElement('li', { parent: entryContainer })
		const a = createElement('a', { download: '', href: url, text: name, parent: li, js: [pointerDownJSAnchor, makeAnchorDragAndDroppableIfNecessary] })
	})
}

const topBarElement = document.getElementById('top-bar')
const topRightControls = createElement({ id: 'top-right-controls', parent: topBarElement })

const viewChangeContainer = createElement({ id: 'view-change', parent: topRightControls })
const viewChangePointerDown = f => {
	return e => {
		if (e.buttons == 1 && e.pointerType == 'mouse') f()
	}
}
const viewChangeClick = f => {
	return e => {
		if (e.pointerType != 'mouse') f()
	}
}
const viewChangeGridViewButton = createElement('button', { class: 'grid-view', onpointerdown: viewChangePointerDown(setGridView), onclick: viewChangeClick(setGridView), parent: viewChangeContainer }, icons.gridView())
const viewChangeListViewButton = createElement('button', { class: 'list-view', onpointerdown: viewChangePointerDown(setListView), onclick: viewChangeClick(setListView), parent: viewChangeContainer }, icons.viewList())
const viewChangeCompactListViewButton = createElement('button', { class: 'compact-list-view', onpointerdown: viewChangePointerDown(setCompactListView), onclick: viewChangeClick(setCompactListView), parent: viewChangeContainer }, icons.tableRowsNarrow())

function setView() {
	(({
		'grid': setGridView,
		'list': setListView,
		'compact-list': setCompactListView,
	})[currentView])()
}

/* -------------------------------------------------------------------------- */
/*                                   Sorting                                  */
/* -------------------------------------------------------------------------- */
let currentSorting = 'name'
let currentSortingReversed = false

function changeDataSortingAndUpdate() {
	switch (currentSorting) {
		case 'name':
			data.entries.sort((a, b) => (a.name.toLowerCase() + flipCase(a.name)).charCodeAt() - (b.name.toLowerCase() + flipCase(b.name)).charCodeAt())
			break
		case 'modified':
			data.entries.sort((a, b) => b.modified - a.modified)
			break
		case 'size':
			data.entries.sort((a, b) => b.size - a.size)
			break
	
		default:
			throw new Error('Unknown sorting key')
	}
	if (currentSortingReversed) data.entries.reverse()

	setView()
}

function titleCase(string) {
	return string[0].toUpperCase() + string.slice(1).toLowerCase()
}

function flipCase(string) {
	return [...string].map(i => i == i.toUpperCase() ? i.toLowerCase() : i.toUpperCase()).join('')	
}

const sortOptions = ['name', 'modified', 'size']
const sortIcons = [icons.sortByAlpha(), icons.schedule(), icons.storage()]

const sortOptionsContainer = createElement({ id: 'sort-options', insertBefore: viewChangeContainer })
const sortCycleButton = createElement('button', { class: 'cycle-button', parent: sortOptionsContainer }, sortIcons[sortOptions.findIndex(i => i == currentSorting)])
const sortCycleButtonOnClick = e => {
	let currentIndex = sortOptions.findIndex(i => i == currentSorting)
	;(e.shiftKey ^ e.buttons == 2) ? currentIndex-- : currentIndex++
	currentIndex = (currentIndex + sortOptions.length) % sortOptions.length
	currentSorting = sortOptions[currentIndex]
	sortCycleButton.replaceChildren(sortIcons[currentIndex])
	changeDataSortingAndUpdate()
}
sortCycleButton.addEventListener('pointerdown', e => {
	if ((e.buttons != 1 && e.buttons != 2) || e.pointerType != 'mouse') return
	sortCycleButtonOnClick(e)
})
sortCycleButton.addEventListener('click', e => {
	if (e.pointerType == 'mouse') return
	sortCycleButtonOnClick(e)
})
sortCycleButton.addEventListener('contextmenu', e => {
	e.preventDefault()
})
const sortReverseButton = createElement('button', { class: 'reverse-button', parent: sortOptionsContainer }, currentSortingReversed ? icons.arrowUpwardAlt() : icons.arrowDownwardAlt())
const sortReverseButtonOnClick = e => {
	currentSortingReversed = !currentSortingReversed
	changeDataSortingAndUpdate()
	sortReverseButton.replaceChildren(currentSortingReversed ? icons.arrowUpwardAlt() : icons.arrowDownwardAlt())
}
sortReverseButton.addEventListener('pointerdown', e => {
	if (e.buttons != 1 || e.pointerType != 'mouse') return
	sortReverseButtonOnClick(e)
})
sortReverseButton.addEventListener('click', e => {
	if (e.pointerType == 'mouse') return
	sortReverseButtonOnClick(e)
})

changeDataSortingAndUpdate()

// refresh when loaded from bfcache
addEventListener('pageshow', e => {
	if (e.persisted) {
		changeDataSortingAndUpdate()
	}
})

async function goToPath(path, pushState = true, updateData = true) {
	if (pushState) history.pushState({}, '', path)
	if (updateData) {
		data = await (await fetch(path + '?data=true')).json()
	}
	document.title = data.title
	
	/* ---------------------------------- Path ---------------------------------- */
	const pathElement = pathWrapper.firstElementChild
	pathElement.replaceChildren()
	if (data.path_components.length > 1) {
		for (const [index, entry] of data.path_components.entries()) {
			pathElement.append(createElement('a', { href: entry.url, text: entry.name, js: pointerDownJSAnchor }))
			;(index != data.path_components.length - 1) && pathElement.append(icons.chevron_right())
		}
	}

	changeDataSortingAndUpdate()
}

goToPath(location.pathname, false, false)

addEventListener('popstate', e => {
	goToPath(location.pathname, false)
})
