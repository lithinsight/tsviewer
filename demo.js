import './openseadragon-curtain-sync.js';



// Basic viewer setup

let viewer = null;

document.getElementById("file-picker").onchange = async function () {
  clearImageInfo();

  const files = Array.from(this.files);
  if (!files.length) return;

  // Resolve all GeoTIFF tile sources for each file
  const allTileSources = await Promise.all(
    files.map(file =>
      OpenSeadragon.GeoTIFFTileSource.getAllTileSources(file, { logLatency: true })
    )
  );

  // Flatten: each file may produce multiple tile sources (pages)
  // Build the images array for CurtainSyncViewer
  const images = [];
allTileSources.forEach((tileSources, fileIndex) => {
  tileSources.forEach((ts, pageIndex) => {
    images.push({
      key: `file${fileIndex}-page${pageIndex}`,
      tileSource: ts,
      shown: images.length < 2, //first 2 shown by default
      label: tileSources.length > 1
        ? `${files[fileIndex].name} (page ${pageIndex + 1})`
        : files[fileIndex].name,
    });
  });
});

  if (!images.length) {
    document.getElementById("filename").textContent = "No valid tile sources found.";
    return;
  }

  // Destroy previous viewer if it exists
    console.log(viewer)
  if (viewer) {
  try {
    viewer.viewer?.destroy();
  } catch (e) {
    console.warn("viewer destroy failed", e);

  }
  
  viewer = null;
  document.querySelector("#viewer").innerHTML = "";
  document.getElementById("image-toggles").innerHTML = "";
  document.getElementById("capture-btn").disabled = true;
}

  document.getElementById("filename").textContent =
    files.map(f => f.name).join(", ") + ` — ${images.length} image(s)`;

//a function to build checkbox elements based on the selected images
function buildToggles(images) {
  const container = document.getElementById("image-toggles");
  container.innerHTML = "";
  images.forEach((img, i) => {
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = img.shown;
    checkbox.addEventListener("change", () => {
      viewer.setImageShown(img.key, checkbox.checked);
    });
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(` ${img.label}`));
    container.appendChild(label);
  });
}
  // Init the curtain-sync viewer
  viewer = new CurtainSyncViewer({
    container: document.querySelector("#viewer"),
    images: images,
    osdOptions: {
      prefixUrl: "https://cdn.jsdelivr.net/npm/openseadragon@6.0.2/build/openseadragon/images/",
      crossOriginPolicy: "Anonymous",
      ajaxWithCredentials: true,
      showNavigationControl: true,
      navigationControlAnchor: OpenSeadragon.ControlAnchor.TOP_LEFT,
    },
  });
//build the checkboxes to allow images to be turned on and off
buildToggles(images);
document.getElementById("capture-btn").disabled = false;

  // Wait for all tile sources to be ready, then show info
  await Promise.all(images.map(img => img.tileSource.promises?.ready));
  showTileSourcesInfo(images.map(img => img.tileSource));

// add scalebar to viewport
const pixelsPerMeter = getPixelsPerMeter(images[0].tileSource);
console.log(pixelsPerMeter)
const osdViewer = viewer.mode.viewer;
osdViewer.scalebar({
  type: OpenSeadragon.ScalebarType.MICROSCOPY,
  pixelsPerMeter: pixelsPerMeter,
  minWidth: "75px",
  location: OpenSeadragon.ScalebarLocation.TOP_RIGHT,
  xOffset: 10,
  yOffset: 10,
  stayInsideImage: true,
  color: "white",
  fontColor: "white",
  backgroundColor: "rgba(0,0,0,0.5)",
  barThickness: 3,
});
};
// Capture button functionality that captures image from current viewport with scale and downloads as png
document.getElementById("capture-btn").addEventListener("click", function() {
  const canvas = viewer.mode.viewer.scalebarInstance.getImageWithScalebarAsCanvas();
  canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "screenshot.png";
    a.click();
    URL.revokeObjectURL(url);
  });
});
//set up link between Capture button and p keypress
document.addEventListener("keydown", function(e) {
  if (e.key === "p" && !e.ctrlKey && !e.metaKey) {
    document.getElementById("capture-btn").click();
  }
})
//extract the source image pixel resolution
function getPixelsPerMeter(ts) {
  const fd = ts.GeoTIFFImages[0].fileDirectory;
  const xRes = fd.XResolution;
  const resUnit = fd.ResolutionUnit ?? 2; // default is inch
  // XResolution may be a rational [numerator, denominator]
  const raw = (xRes && xRes.length >= 2) ? xRes[0] / xRes[1] : xRes;
  if (resUnit === 3) return raw * 100;       // pixels/cm → pixels/m
  if (resUnit === 2) return raw * 39.3701;   // pixels/inch → pixels/m
  return raw; // unit unknown, use as-is
}
//The following functions provide image data at the bottom
function clearImageInfo() {
  document.getElementById("image-description").textContent = "";
  document.getElementById("associated-images").textContent = "";
  document.getElementById("filename").textContent = "";
}

function showTileSourcesInfo(tileSources) {
  clearImageInfo();
  let desc = document.getElementById("image-description");
  tileSources.map((ts, index) => {
    let images = ts.GeoTIFFAllImages || ts.GeoTIFFImages;
    let h = document.createElement("h3");
    h.textContent = "TileSource #" + index;
    desc.appendChild(h);
    showImageInfo(images);
    desc.appendChild(document.createElement("hr"));
    return images;
  });
}
function showImageInfo(images) {
  let desc = document.getElementById("image-description");
  let frag = document.createDocumentFragment();

  images.forEach((image, index) => {
    let d = document.createElement("div");
    frag.appendChild(d);
    let t = document.createElement("h4");
    d.appendChild(t);
    t.textContent = "Tiff Page " + index;

    let fd = Object.assign({}, image.fileDirectory);
    if (fd.ImageDescription) {
      let info = document.createElement("div");
      d.appendChild(info);
      let ID =
        "<u>ImageDescription contents for this subimage</u><br>" +
        fd.ImageDescription.replaceAll("|", "<br>");
      delete fd.ImageDescription;
      info.innerHTML = ID;
    }

    let to_print = {};
    Object.entries(fd).forEach(([k, v]) => {
      to_print[k] =
        typeof v !== "string" && v.length > 8
          ? "" + v.constructor.name + " (" + v.length + ") [...]"
          : typeof v !== "string" && typeof v.length !== "undefined"
            ? v.constructor.name + "(" + v.length + ") [" + [...v.values()] + "]"
            : v;
    });

    let pre = document.createElement("pre");
    d.appendChild(pre);
    pre.textContent = JSON.stringify(to_print, null, 2);
  });
  desc.appendChild(frag);
}
