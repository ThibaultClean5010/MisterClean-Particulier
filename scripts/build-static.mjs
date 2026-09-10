import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const output = resolve(root, "dist");
if (output !== resolve(root, "dist") || output === root) {
  throw new Error(`Refusing to clean unexpected output directory: ${output}`);
}

await rm(output, { recursive: true, force: true });
await mkdir(resolve(output, "Images"), { recursive: true });
await mkdir(resolve(output, "assets"), { recursive: true });

for (const file of ["index.html", "script.js", "styles.css", "robots.txt", "sitemap.xml"]) {
  await cp(resolve(root, file), resolve(output, file));
}

await cp(resolve(root, "booking"), resolve(output, "booking"), { recursive: true });
await cp(resolve(root, "admin"), resolve(output, "admin"), { recursive: true });
await cp(resolve(root, "assets", "outdoor-pressure-cleaning.png"), resolve(output, "assets", "outdoor-pressure-cleaning.png"));

for (const file of [
  "logo.webp",
  "thibault-cleaning.jpg",
  "Sofa Alex lean.png",
  "Sofa up to 3 seats.png",
  "Sofa up to 4 seats.png",
  "Sofa up to 5 seats.png",
  "Working 2.png",
  "Working 5.jpeg",
  "Working 6.jpeg",
  "Carpet.jpeg",
  "dirty sofa alex 1_2.jpg",
  "Couch 4 places dirty .jpg",
  "Couch 4 places clean.jpg",
  "Chaise salle a manger.png",
  "Fauteuil.png",
  "Matelas Single.png",
  "Matelas Queen.png",
  "Matelas King.png",
  "light-sofa-before-600.webp",
  "light-sofa-before-1200.webp",
  "light-sofa-after-600.webp",
  "light-sofa-after-1200.webp",
  "grey-sofa-before-600.webp",
  "grey-sofa-before-1200.webp",
  "grey-sofa-after-600.webp",
  "grey-sofa-after-1200.webp",
  "four-seat-sofa-before-600.webp",
  "four-seat-sofa-before-1200.webp",
  "four-seat-sofa-after-600.webp",
  "four-seat-sofa-after-1200.webp",
  "grey-chaise-before-600.webp",
  "grey-chaise-before-1200.webp",
  "grey-chaise-after-600.webp",
  "grey-chaise-after-1200.webp",
  "sofa-stains-before-600.webp",
  "sofa-stains-before-1200.webp",
  "sofa-stains-after-600.webp",
  "sofa-stains-after-1200.webp",
]) {
  await cp(resolve(root, "Images", file), resolve(output, "Images", file));
}

console.log("Static site built in dist/");
