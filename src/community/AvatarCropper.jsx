import { useEffect, useRef } from "react";
import { ArrowClockwise } from "@phosphor-icons/react/ArrowClockwise";

export function AvatarCropper({ crop, onChange, onCancel, onApply, busy }) {
  const cropGesture = useRef(null);
  const cropCanvas = useRef(null);
  const cropUrl = crop?.url;
  const cropRotation = crop?.rotation;
  const cropStageAspect = crop?.stageAspect;

  useEffect(() => {
    if (!cropUrl || cropRotation == null || cropStageAspect == null || !cropCanvas.current) return undefined;
    const canvas = cropCanvas.current;
    const context = canvas.getContext("2d");
    const image = new Image();
    image.onload = () => {
      const width = 640;
      const height = Math.round(width / cropStageAspect);
      canvas.width = width; canvas.height = height;
      context.clearRect(0, 0, width, height);
      const quarterTurn = Math.abs(cropRotation % 180) === 90;
      const rotatedWidth = quarterTurn ? image.naturalHeight : image.naturalWidth;
      const rotatedHeight = quarterTurn ? image.naturalWidth : image.naturalHeight;
      const scale = Math.min(width / rotatedWidth, height / rotatedHeight);
      context.save();
      context.translate(width / 2, height / 2);
      context.rotate(cropRotation * Math.PI / 180);
      context.drawImage(image, -image.naturalWidth * scale / 2, -image.naturalHeight * scale / 2, image.naturalWidth * scale, image.naturalHeight * scale);
      context.restore();
    };
    image.src = cropUrl;
    return () => { image.onload = null; };
  }, [cropUrl, cropRotation, cropStageAspect]);

  const imageBounds = (value) => {
    const quarterTurn = Math.abs(value.rotation % 180) === 90;
    const width = quarterTurn ? value.height : value.width;
    const height = quarterTurn ? value.width : value.height;
    const stageHeight = 1 / value.stageAspect;
    const scale = Math.min(1 / width, stageHeight / height);
    const imageWidth = width * scale;
    const imageHeight = height * scale;
    return { x: (1 - imageWidth) / 2, y: (stageHeight - imageHeight) / 2, width: imageWidth, height: imageHeight };
  };
  const rotateCrop = () => onChange((value) => {
    if (!value) return value;
    const rotation = (value.rotation + 90) % 360;
    const orientedAspect = rotation % 180 === 90 ? value.height / value.width : value.width / value.height;
    const next = { ...value, rotation, stageAspect: Math.min(1.5, Math.max(.72, orientedAspect)) };
    const bounds = imageBounds(next);
    const size = Math.min(bounds.width, bounds.height);
    return { ...next, cropX: bounds.x + (bounds.width - size) / 2, cropY: bounds.y + (bounds.height - size) / 2, cropSize: size };
  });
  const startCropDrag = (event) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    cropGesture.current = { mode: event.target.dataset.corner ? "resize" : "move", corner: event.target.dataset.corner || "", pointerId: event.pointerId, x: event.clientX, y: event.clientY, crop: { ...crop } };
  };
  const moveCrop = (event) => {
    const gesture = cropGesture.current;
    if (!gesture) return;
    if (event.pointerType === "mouse" && event.buttons === 0) { cropGesture.current = null; return; }
    const bounds = event.currentTarget.getBoundingClientRect();
    const dx = (event.clientX - gesture.x) / bounds.width;
    const dy = (event.clientY - gesture.y) / bounds.width;
    const image = imageBounds(gesture.crop);
    if (gesture.mode === "resize") {
      const minimum = Math.min(image.width, image.height) * .2;
      const pointerX = gesture.crop.cropX + (event.clientX - gesture.x) / bounds.width + ({ nw: 0, sw: 0, ne: gesture.crop.cropSize, se: gesture.crop.cropSize }[gesture.corner] || 0);
      const pointerY = gesture.crop.cropY + (event.clientY - gesture.y) / bounds.width + ({ nw: 0, ne: 0, sw: gesture.crop.cropSize, se: gesture.crop.cropSize }[gesture.corner] || 0);
      const right = gesture.crop.cropX + gesture.crop.cropSize;
      const bottom = gesture.crop.cropY + gesture.crop.cropSize;
      let size; let cropX = gesture.crop.cropX; let cropY = gesture.crop.cropY;
      if (gesture.corner === "nw") { size = Math.min(right - pointerX, bottom - pointerY, right - image.x, bottom - image.y); cropX = right - size; cropY = bottom - size; }
      if (gesture.corner === "ne") { size = Math.min(pointerX - gesture.crop.cropX, bottom - pointerY, image.x + image.width - gesture.crop.cropX, bottom - image.y); cropY = bottom - size; }
      if (gesture.corner === "sw") { size = Math.min(right - pointerX, pointerY - gesture.crop.cropY, right - image.x, image.y + image.height - gesture.crop.cropY); cropX = right - size; }
      if (gesture.corner === "se") size = Math.min(pointerX - gesture.crop.cropX, pointerY - gesture.crop.cropY, image.x + image.width - gesture.crop.cropX, image.y + image.height - gesture.crop.cropY);
      size = Math.max(minimum, size || minimum);
      if (gesture.corner === "nw") { cropX = right - size; cropY = bottom - size; }
      if (gesture.corner === "ne") cropY = bottom - size;
      if (gesture.corner === "sw") cropX = right - size;
      onChange((value) => ({ ...value, cropX, cropY, cropSize: size }));
    } else {
      onChange((value) => ({ ...value,
        cropX: Math.min(image.x + image.width - gesture.crop.cropSize, Math.max(image.x, gesture.crop.cropX + dx)),
        cropY: Math.min(image.y + image.height - gesture.crop.cropSize, Math.max(image.y, gesture.crop.cropY + dy)),
      }));
    }
  };
  const endCropDrag = () => { cropGesture.current = null; };
  useEffect(() => {
    window.addEventListener("pointerup", endCropDrag, true);
    window.addEventListener("pointercancel", endCropDrag, true);
    window.addEventListener("blur", endCropDrag);
    return () => { window.removeEventListener("pointerup", endCropDrag, true); window.removeEventListener("pointercancel", endCropDrag, true); window.removeEventListener("blur", endCropDrag); };
  }, []);

  return <section className="avatar-crop-panel" aria-label="裁剪和旋转头像"><header><strong>裁剪和旋转</strong><p>拖动方框调整位置，拖动任意角改变裁剪范围。</p></header><div className="avatar-crop-layout"><div className="avatar-crop-stage" style={{ aspectRatio: crop.stageAspect }} onPointerMove={moveCrop} onPointerUp={endCropDrag} onPointerCancel={endCropDrag}><canvas ref={cropCanvas} aria-label="待裁切头像预览" /><div className="avatar-crop-selection" style={{ left: `${crop.cropX * 100}%`, top: `${crop.cropY * crop.stageAspect * 100}%`, width: `${crop.cropSize * 100}%`, aspectRatio: "1 / 1" }} role="group" aria-label="头像裁剪区域" onPointerDown={startCropDrag} onLostPointerCapture={endCropDrag}><i data-corner="nw" /><i data-corner="ne" /><i data-corner="sw" /><i data-corner="se" /></div></div><button className="avatar-rotate-button" type="button" onClick={rotateCrop}><ArrowClockwise size={20} />旋转</button></div><footer><button type="button" onClick={onCancel} disabled={busy}>取消</button><button type="button" className="community-primary-button" onClick={onApply} disabled={busy}>{busy ? "处理中…" : "使用这个范围"}</button></footer></section>;
}
