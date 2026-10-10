// The HTML of a page holds its link preview (api/linkPreviews), for crawlers.
// Its theme-color, a public character's colour, would tint the browser's bar
// on every page the app goes to after it: the app's own stays.
document.querySelectorAll('meta[name="theme-color"][data-link-preview]').forEach(tag => tag.remove());

export {};
