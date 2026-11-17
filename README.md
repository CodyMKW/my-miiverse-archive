# Miiverse Archive

A personal archive of everything CodyMKW posted on Miiverse between 2013 and 2017: 1,154 posts, 36 drawings, 76 linked videos and 70 saved screenshots, plus the profile page as it looked when the service closed.

The data comes from the archive Nintendo made available before Miiverse shut down on November 8, 2017. Nothing in it has been edited.

## What's in this repo

| Path | What it is |
| --- | --- |
| `index.html` and `assets/` | The original archive page, exactly as Nintendo provided it. |
| `miiverse-modern/` | A redesigned viewer for the same archive. It has its own copy of the data and images, so it works on its own. |

## The modern viewer

Open `miiverse-modern/index.html` through any static web server.

- **Activity ribbon.** Posts per month, 2013 to 2017. Select a month to show only that month's posts.
- **Filters.** Search text, post type (play journal, in-game, discussions, drawings, videos, screenshots), year, and game or community. Sort by newest, oldest, most Yeahs or most replies.
- **Screenshot album.** All 70 saved screenshots, grouped by game.
- **Image viewer.** Open any screenshot or drawing full size and move through them with the arrow keys. Press Escape to close.
- **Spoilers hidden.** Posts marked as spoilers stay blurred until you choose to show them.
- **Light and dark themes.** It follows your system setting, and the toggle in the top bar overrides it.
- **Shareable links.** The current view is stored in the URL, so you can link straight to a filtered list.
- **Works on phones.** The layout adapts down to small screens.

It uses plain HTML, CSS and JavaScript, with no libraries and no build step. The fonts (Bricolage Grotesque and Figtree) load from Google Fonts, and the page falls back to your system fonts if they can't load.

### Run it locally

Opening the file directly usually works, but a local server is more reliable:

```bash
cd miiverse-modern
python3 -m http.server 8000
```

Then visit <http://localhost:8000>.

### How the data is laid out

The viewer reads the original archive files without changing them.

```
miiverse-modern/
├── index.html
├── css/style.css
├── js/app.js
└── assets/
    ├── common/img/        icons, favicon, device images
    └── user/
        ├── js/
        │   ├── user.js          profile (name, bio, birthday, genres)
        │   ├── post_index.js    list of post files, one per year
        │   ├── posts/<year>.js  the posts for that year
        │   ├── title.js         game names, keyed by title ID
        │   ├── community.js     community names and icons
        │   └── album_images.js  screenshot album, grouped by game
        └── img/
            ├── ss/      screenshots (.jpg)
            ├── pa/      drawings (.png)
            ├── icon/    game and community icons (.png)
            └── mii/     Mii expressions (.png)
```

Each post is an object with fields such as `body`, `created_at`, `mii`, `empathy_count` (Yeahs), `reply_count`, `community` or `title`, and flags like `ss` (has a screenshot), `pa` (is a drawing), `yt` (YouTube video ID) and `spoiler`. A post's screenshot is `assets/user/img/ss/<aid or id>.jpg`, and its drawing is `assets/user/img/pa/<id>.png`.

To add posts for another year, create `assets/user/js/posts/<year>.js` that defines `var posts<year> = [...]` and add a line for it to `post_index.js`.

## Notes

- YouTube thumbnails and links come from YouTube. Some of those videos may no longer exist.
- Miiverse and all related names, characters and artwork belong to Nintendo. This is a personal, non-commercial archive.
