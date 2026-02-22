# Newcomb & District Cricket Club — Website

Static single-page website for the **NDCC Dinos**, built for GitHub Pages.

Live site: `https://<your-github-username>.github.io/<repo-name>/`

---

## Stack

- **HTML5** — semantic structure (`nav`, `header`, `section`, `footer`)
- **Tailwind CSS** — via CDN, no build step required
- **Vanilla JS** — hamburger menu, scroll behaviour, mailto link injection
- **Base64 embedded assets** — logo and cover photo baked into `index.html`, no external file dependencies

---

## Repo Structure

```
/
├── index.html        # Entire site — single deployable file
└── README.md
```

No `src/` folder is required. All images are embedded directly in `index.html` as base64 data URIs.

---

## Deployment

This site deploys automatically via GitHub Pages from the `main` branch.

1. Push `index.html` to the `main` branch root
2. Go to **Settings > Pages**
3. Set source to `main` branch, `/ (root)`
4. GitHub Pages will serve the site at your `.github.io` URL within a minute

No build pipeline, no Node, no dependencies.

---

## Content

| Section | Details |
|---|---|
| Hero | Cover photo with club name, tagline, Join CTA |
| About | Club history, GCA affiliation, Good Sports accreditation, Newcomb Power FC partnership |
| Facilities | Peter 'Skinny' Harrison Training Facility (Aug 2024), 3 public synthetic + 4 club turf lanes |
| Teams | Senior Men (GCA Grade 4), Senior Women (GCA E Grade East), Junior Boys |
| Social | Facebook, Instagram, PlayHQ links |
| Contact | Grinter Reserve address, office bearers, email CTA |
| Footer | Wadawurrung Country acknowledgement |

---

## Club Details

| Field | Value |
|---|---|
| Ground | Grinter Reserve, 141 Coppards Road, Moolap VIC 3221 |
| Email | ndsc.cricket@gmail.com |
| President | John Elliott |
| Vice President | Troy Whitworth |
| Treasurer | Laura Hudson |
| GCA affiliation | Senior Men — Grade 4; Senior Women — E Grade East |
| Established | 1972 |

---

## Updating Content

All content is in `index.html`. No framework, no components — find the relevant section by searching for the section `id`:

- `id="about"` — club history and accreditations
- `id="facilities"` — training facility details
- `id="teams"` — grades and team descriptions
- `id="contact"` — address and office bearers

### Changing the email address

The contact email is assembled at runtime by a JS block near the bottom of `index.html` to prevent email scraping. Search for `var u =` to find it and update the character arrays.

### Replacing images

Images are base64 encoded inline. To swap them out:

1. Convert your new image to base64: `base64 -i your-image.png | tr -d '\n'`
2. Search for `data:image/png;base64,` in `index.html`
3. Replace the relevant base64 string (logo appears twice — nav and footer; cover appears once in the hero)

Or re-run the Python embedding script if available.

### Adding office bearers or updating grades

Search for `Office Bearers` or the team name directly in `index.html` and edit the text in place.

---

## Known Constraints

- **Tailwind CDN warning** in the browser console is expected and harmless. It's Tailwind recommending their CLI for production apps. For a static club site with no build pipeline, ignore it.
- File size is ~1.4 MB due to embedded images. GitHub Pages serves this fine; it's a one-time load with no further requests.
- The site is not a PWA and has no service worker — intentional, keeps it simple.

---

## Acknowledgement

Newcomb & District Cricket Club acknowledges the **Wadawurrung people** as the traditional custodians of the land on which we play and train. We pay our respects to Elders past, present, and emerging.
