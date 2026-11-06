/* Small helpers shared by the houses, house, agents, agent-hub and reviews pages.
   Load after api.js. */

// ★★★★☆ for a rating from 1 to 5
function stars(rating) {
  const full = Math.max(0, Math.min(5, Math.round(rating || 0)));
  return `<span class="stars" role="img" aria-label="${full} out of 5 stars">${'★'.repeat(full)}<span class="off">${'★'.repeat(5 - full)}</span></span>`;
}

// ★★★★☆ 4.5 (3 reviews)   or   "No reviews yet"
function ratingLine(avg, count) {
  if (!count) return '<span class="rating-line muted">No reviews yet</span>';
  return `<span class="rating-line">${stars(avg)} <b>${Number(avg).toFixed(1)}</b> <span class="muted">(${count} ${count === 1 ? 'review' : 'reviews'})</span></span>`;
}

// WhatsApp link with a ready-typed message
function waLink(phone, text) {
  return whatsapp(phone) + (text ? '?text=' + encodeURIComponent(text) : '');
}

const photoUrl = (name) => '/uploads/houses/' + encodeURIComponent(name);

function when(iso) {
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Shrink a picture file to a smaller JPEG (max 1280px wide/high) and return it as a data URL.
// Phone photos are often 5 MB+, so this keeps uploads fast and cheap on data.
async function shrinkPhoto(file, maxSide = 1280) {
  const bitmap = await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not a picture we can read.')); };
    img.src = url;
  });
  const scale = Math.min(1, maxSide / Math.max(bitmap.naturalWidth, bitmap.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.naturalWidth * scale);
  canvas.height = Math.round(bitmap.naturalHeight * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  let quality = 0.82, dataUrl = canvas.toDataURL('image/jpeg', quality);
  while (dataUrl.length > 1_900_000 && quality > 0.4) {      // keep each picture under ~1.4 MB
    quality -= 0.1;
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  }
  return dataUrl;
}

// Small green badge shown next to agents who an admin has approved.
const verifiedPill = '<span class="pill verified" title="An admin has checked this agent">✔ Verified agent</span>';
