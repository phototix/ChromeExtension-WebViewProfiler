# WebView Profiler

`WebView Profiler` is a Chrome extension that opens a DevTools panel for applying saved page-cleanup profiles to the currently inspected tab.

It is designed for sites whose layouts contain headers, overlays, sticky wrappers, or repeated components that you want to hide quickly without manually editing the page every time.

## What it does

- Adds a DevTools panel with a website profile dropdown
- Shows live per-tab traffic stats in the panel (total bytes, bytes/sec, request count, latest entries)
- Loads predefined cleanup rules from JSON files in `profiles/`
- Applies the selected profile to the active tab when you click **Apply**
- Shows a per-profile rule activation list in the panel
- Lets you dynamically toggle `remove`, `disableFavicon`, `setAddressBar`, `setTitle`, `style`, `pauseMedia`, and `stopMedia` rules on/off before apply
- Supports four rule types:
	- remove matching elements
	- override CSS properties with `!important`
	- remove or hide everything after a matched anchor element
	- pause media elements, disable autoplay/preload, clear media `src` values, and keep enforcing a media-stop guard for dynamically re-created players

## Included profiles

- `bigo-tv.json`
- `bigo-tv-video-potrait.json`
- `facebook.json`
- `google.json`

The Bigo.tv profile currently removes:

- `header.PageHead-Component`
- `div.FixTool-Component`
- `div.privacy-popup`
- `div.chat-item.type-init`

It also applies style overrides such as:

- `.def-container .page-wrapper { padding-top: 0px !important; }`
- `.room[data-v-34d904d8] { margin: 0px !important; }`

and removes all elements that appear after `div.room-container`.

## Project structure

- `manifest.json` — Chrome extension manifest
- `devtools.html` / `devtools.js` — registers the DevTools panel
- `panel.html` / `panel.css` / `panel.js` — panel UI and profile runner
- `profiles/` — JSON cleanup profiles for each site

## How to install

1. Open `chrome://extensions/`
2. Turn on **Developer mode**
3. Click **Load unpacked**
4. Select the `ChromeExtension-WebViewProfiler` folder
5. Open DevTools on any page and choose the **WebView Profiler** panel

## How it works

Each profile JSON file contains a list of rules. A rule can:

- remove elements matching a CSS selector
- neutralize tab favicon links by replacing them with a blank icon and guarding against dynamic re-insertion
- sanitize the visible address bar URL to a general SFW path without navigating away (same-origin `history.replaceState`)
- replace the tab/page title with a general SFW title and keep enforcing it against dynamic title changes
- change CSS properties on matched elements
- remove or hide all following siblings after a matched element
- pause matching `<video>`/`<audio>` elements (or media within a matched container)
- if media `src` (or nested `<source src>`) has a value, set it to `""` to stop loading

`pauseMedia` and `stopMedia` are both supported and currently run the same media-stop behavior.

For `pauseMedia` / `stopMedia`, the extension now also installs a persistent media guard in the inspected page:

- stops matching media immediately
- blocks subsequent `play()` calls on guarded media elements
- watches DOM mutations and re-stops media if the site re-renders/recreates the player

This helps reduce continued stream playback traffic after the video element is hidden.

The extension runs those rules inside the inspected page using the DevTools API, so the changes apply immediately to the active tab.

In the panel, each rule from the selected JSON profile is listed with its selector and type:

- `remove`, `disableFavicon`, `setAddressBar`, `setTitle`, `style`, `pauseMedia`, and `stopMedia` rules can be turned **ON/OFF** dynamically.
- Other rule types (for example `removeAfter`, `hideAfter`) are shown as **ALWAYS ON**.

## Profile format

Example:

```json
{
	"id": "example-site",
	"label": "Example Site",
	"description": "Cleans up the page layout.",
	"rules": [
		{
			"type": "remove",
			"selector": "header.site-header"
		},
		{
			"type": "style",
			"selector": ".page-wrapper",
			"declarations": {
				"padding-top": {
					"value": "0px",
					"important": true
				}
			}
		},
		{
			"type": "removeAfter",
			"selector": ".main-content"
		},
		{
			"type": "stopMedia",
			"selector": "#heroVideo"
		}
	]
}
```

## Customizing profiles

To add or update a site profile:

1. Edit or create a file in `profiles/`
2. Add selectors that match the page elements you want to hide or change
3. Refresh the extension in `chrome://extensions/`
4. Reopen DevTools and apply the profile again

## Notes

- Profiles are selector-based, so they may need updates when a website changes its DOM structure.
- The included Facebook and Google profiles are starter examples and may need refinement for the current site layout.
- If a selector does not match anything, the panel will report it in the result message.
- Traffic metrics are in-memory only, reset on navigation/refresh, and are not persisted.

## License

No license has been specified yet.