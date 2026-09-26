// The board frame art (ui-board-frame.webp, the owner's gold, marble and ruby frame): its width and the rim on
// each side, in image pixels. The board fills the frame's opening.
const FRAME = { width: 1226, left: 114, right: 114, top: 121, bottom: 127 };

/** The frame's rims as a share of the frame's width: side rims together, top + bottom rims together. */
export const FRAME_RIM_X = (FRAME.left + FRAME.right) / FRAME.width;
export const FRAME_RIM_Y = (FRAME.top + FRAME.bottom) / FRAME.width;

/** The frame's padding around a board `size` px wide. */
export function framePadding(size: number) {
  const s = size / (FRAME.width - FRAME.left - FRAME.right);
  return `${FRAME.top * s}px ${FRAME.right * s}px ${FRAME.bottom * s}px ${FRAME.left * s}px`;
}
