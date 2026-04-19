const isViteDev = !!(import.meta.env && import.meta.env.DEV);

const libPath = isViteDev
  ? "./src/main.js"
  : "./dist/geotiff-tilesource.min.js";

const { enableGeoTIFFTileSource } = await import(/* @vite-ignore */libPath);
enableGeoTIFFTileSource(window.OpenSeadragon);