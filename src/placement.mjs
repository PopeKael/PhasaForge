export function placeNearAnchor(anchor, workArea, windowSize, gap = 10) {
  const right = anchor.x + (anchor.width ?? 0) + gap;
  const below = anchor.y + (anchor.height ?? 0) + gap;
  const leftSide = anchor.x - windowSize.width - gap;
  const above = anchor.y - windowSize.height - gap;
  let x = right + windowSize.width <= workArea.x + workArea.width ? right : leftSide;
  let y = below + windowSize.height <= workArea.y + workArea.height ? below : above;
  const maxX = workArea.x + Math.max(0, workArea.width - windowSize.width);
  const maxY = workArea.y + Math.max(0, workArea.height - windowSize.height);
  x = Math.max(workArea.x, Math.min(x, maxX));
  y = Math.max(workArea.y, Math.min(y, maxY));
  return { x: Math.round(x), y: Math.round(y) };
}

export function distanceToWorkArea(point, area) {
  const dx = Math.max(area.x - point.x, 0, point.x - (area.x + area.width));
  const dy = Math.max(area.y - point.y, 0, point.y - (area.y + area.height));
  return dx * dx + dy * dy;
}
