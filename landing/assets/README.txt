Brand assets for the landing page. These are the web-sized copies; originals stay
where they were exported from.

Present
-------
rocklab-technologies.jpg   RockLab Technologies LLC lockup, cropped tight to the
                           art (R mark + ROCKLAB + TECHNOLOGIES LLC + tagline),
                           620px wide / 100KB, ~1.95:1. The source was a
                           1536x1024 2.1MB PNG that was mostly background - at
                           header size the uncropped art read as a tiny dark
                           rectangle, so it is cropped instead.
hero-technologies.jpg      RockLab Technologies lockup art, 1200px / 80% JPEG / 330KB,
                           used as the hero image. Full art (R mark + ROCKLAB +
                           TECHNOLOGIES LLC + Innovate/Develop/Empower tagline).
                           The container is ~2.2:1 against a 3:2 image, so CSS
                           crops it at object-position 28% to keep the lockup
                           clear of both edges.
brand/hero-athletics.jpg   The RockLab Athletics stadium banner, moved to /brand/
                           because the hero no longer uses it. Kept out of
                           landing/assets so it is not uploaded on every deploy.
rocklab-athletics-logo.png Mountain logo for the Athletics product card.
rocklab-athletics-icon.png Neon app icon, 180px, spare.
volleyengine-logo.png      VolleyEngine Pro logo, from their own site.
og-image.jpg               1200x630 social preview, cropped from the same art.
favicon.svg                Gradient "R" tile, browser tab icon.

Replacing the header logo: keep the filename and roughly the same aspect ratio
(1.95:1). The header renders it 54px tall, so 600px wide is plenty.

If rocklab-technologies.jpg is missing, index.html hides the broken image and
shows a gradient "R" tile with the wordmark instead.
