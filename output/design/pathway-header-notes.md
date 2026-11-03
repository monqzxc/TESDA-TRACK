# Find My Pathway header

The user's supplied header is the design direction: pastel blue illustration, a student on the right, two-line navy/violet headline and three feature cards. Its Display control is omitted. The React frontend had no Display control to remove.

Generated with the built-in image generation tool. Production asset: `frontend/public/img/pathway-header.webp` (2172 × 724). The text and icons are live HTML/SVG; the illustration is decorative and has empty alt text. Existing translations, page heading, navigation and compact final-step heading are retained. The new eyebrow uses the copy catalog's English fallback.

## Final image prompt

Use case: illustration-story. Asset type: decorative website header background for TESDA Find My Pathway. Input image 1 is a composition and style reference only. Generate a polished high resolution wide 3:1 landscape illustration matching the reference's soft pastel blue, violet and mint hand-painted anime editorial style. A cheerful Filipino young adult student with tousled dark navy hair, violet hoodie and navy backpack occupies the far right, looking left with a hopeful smile. Surround him with subtle abstract campus buildings, mint foliage, a floating violet graduation cap, pale cyan route map with dotted curved path and coral destination pin, a lavender bar-chart panel. The leftmost 40 percent must be nearly empty very pale icy blue (#edf6ff), smoothly blending into the illustrated right side so live HTML text can be overlaid. Student head in upper right, torso extending to bottom edge. Keep central lower area quiet for three HTML information cards. Artwork extends edge to edge. No typography, letters, words, headings, numbers, logos, watermark, UI controls or foreground cards. In particular omit the Display control and all text from the reference. Preserve the welcoming educational mood and detailed character illustration.

## Design verification

This is a single-component change with an explicit reference, so no design direction was drawn. Reference-required pastel cards, icon backgrounds, eyebrow and violet accent take precedence over the design skill's defaults. The skill inspector could not connect its browser CDP socket; screenshots and accessibility checks use Playwright with installed Edge instead.

Validation completed: production build, ESLint for the changed component, Prettier, 30 existing FinderPage component tests, and all 6 existing finder browser tests (complete journey, keyboard navigation, empty goal, and axe checks). Final header screenshots and scoped axe checks passed at 1440, 1280, 768, 390 and 320 pixels in light and dark themes. No horizontal page overflow was measured. The optimized WebP is 97,644 bytes.
