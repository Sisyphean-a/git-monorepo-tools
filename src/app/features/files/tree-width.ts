export const treeWidthDefault = 300;
export const treeWidthMin = 220;
export const treeWidthStep = 16;
export const filePreviewWidthMin = 320;
// Rule: 分割条自己占一行宽度，预览区下限必须把它算进上限，否则侧栏拉到上限时会少几个像素。
export const treeResizerWidth = 5;

// Guarantee: 容器已测量时上限保证预览区不少于 filePreviewWidthMin；容器窄到放不下时侧栏下限优先。
export function treeWidthMax(containerWidth: number) {
  if (containerWidth <= 0) return Number.POSITIVE_INFINITY;
  return Math.max(treeWidthMin, containerWidth - filePreviewWidthMin - treeResizerWidth);
}

export function clampTreeWidth(width: number, containerWidth: number) {
  return Math.min(Math.max(width, treeWidthMin), treeWidthMax(containerWidth));
}
