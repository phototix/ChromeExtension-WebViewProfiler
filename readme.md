This is a repo for ChromeExtension

# Main Feature
- User have pre-saved profile of website HTML to remove.

# UI & Design
## devtool page
- A dropdown list of websites "Bigo.tv", "Facebook", "Google"
- Equivalent to bigo-tv.json, facebook.json, google.json.
- Each json contains what element to be remove from the active tab website when "Apply" button clicked.

## Example for page: bigo.tv
- Remove <header class="PageHead-Component" *****>*****</header> the header tag inside <body> that has whatever inside the "*****".
- Remove or disable the style in ".def-container .page-wrapper { padding-top: 60px;}" to padding-top:0px by hi-jack the element by using dom changes with !important.
- Remove all the elments and components after the tag <div class="room-container"*****></div>.

# Generated extension

This repository now contains a working Chrome extension scaffold that matches the README requirements:

- A DevTools panel with a website dropdown.
- Per-site JSON profiles in `profiles/`.
- An `Apply` button that removes elements, changes styles, and removes following siblings from the active tab.

## How to load it in Chrome

1. Open `chrome://extensions/`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select this folder: `ChromeExtension-WebViewProfiler`
5. Open DevTools on a page, then use the `WebView Profiler` panel