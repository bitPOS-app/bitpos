import { useEffect, useRef, useState } from "react";
import { Image as KonvaImage, Text as KonvaText, Rect, Ellipse, Line } from "react-konva";
import type Konva from "konva";
import { generateQrDataUrl } from "./qr";
import {
  CANVAS_W,
  CANVAS_H,
  type ImageEl,
  type StickerEl,
  type TextEl,
  type QrEl,
  type ShapeEl,
  type StudioEl,
} from "./types";

function useHTMLImage(src: string | undefined): HTMLImageElement | undefined {
  const [img, setImg] = useState<HTMLImageElement | undefined>();
  useEffect(() => {
    if (!src) {
      setImg(undefined);
      return;
    }
    const el = new window.Image();
    el.crossOrigin = "anonymous";
    el.onload = () => setImg(el);
    el.src = src;
    return () => {
      el.onload = null;
    };
  }, [src]);
  return img;
}

type DragMove = (e: Konva.KonvaEventObject<DragEvent>) => void;

interface RasterProps {
  el: ImageEl | StickerEl;
  onSelect: () => void;
  onChange: (attrs: Partial<StudioEl>) => void;
  onReady?: () => void;
  onDragMove?: DragMove;
  onDragEnd?: DragMove;
}

export function RasterNode({ el, onSelect, onChange, onReady, onDragMove, onDragEnd }: RasterProps) {
  const image = useHTMLImage(el.src);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    if (image) onReadyRef.current?.();
  }, [image]);

  if (!image) return null;

  return (
    <KonvaImage
      id={el.id}
      image={image}
      x={el.x}
      y={el.y}
      width={el.width}
      height={el.height}
      rotation={el.rotation}
      opacity={el.opacity ?? 1}
      visible={!el.hidden}
      listening={!el.hidden}
      draggable={!el.locked}
      onClick={onSelect}
      onTap={onSelect}
      onDragMove={onDragMove}
      onDragEnd={(e) => {
        onChange({ x: e.target.x(), y: e.target.y() });
        onDragEnd?.(e);
      }}
      onTransformEnd={(e) => {
        const node = e.target;
        onChange({
          x: node.x(),
          y: node.y(),
          width: Math.max(5, node.width() * node.scaleX()),
          height: Math.max(5, node.height() * node.scaleY()),
          rotation: node.rotation(),
        });
        node.scaleX(1);
        node.scaleY(1);
      }}
    />
  );
}

interface QrProps {
  el: QrEl;
  onSelect: () => void;
  onChange: (attrs: Partial<StudioEl>) => void;
  onReady?: () => void;
  onDragMove?: DragMove;
  onDragEnd?: DragMove;
}

export function QrNode({ el, onSelect, onChange, onReady, onDragMove, onDragEnd }: QrProps) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    let alive = true;
    generateQrDataUrl(el.data, el.fg, el.bg).then((u) => {
      if (alive) setSrc(u);
    });
    return () => {
      alive = false;
    };
  }, [el.data, el.fg, el.bg]);

  const image = useHTMLImage(src);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  useEffect(() => {
    if (image) onReadyRef.current?.();
  }, [image]);

  if (!image) return null;

  return (
    <KonvaImage
      id={el.id}
      image={image}
      x={el.x}
      y={el.y}
      width={el.size}
      height={el.size}
      rotation={el.rotation}
      opacity={el.opacity ?? 1}
      visible={!el.hidden}
      listening={!el.hidden}
      draggable={!el.locked}
      onClick={onSelect}
      onTap={onSelect}
      onDragMove={onDragMove}
      onDragEnd={(e) => {
        onChange({ x: e.target.x(), y: e.target.y() });
        onDragEnd?.(e);
      }}
      onTransformEnd={(e) => {
        const node = e.target;
        const size = Math.max(20, node.width() * node.scaleX());
        onChange({ x: node.x(), y: node.y(), size, rotation: node.rotation() });
        node.scaleX(1);
        node.scaleY(1);
      }}
    />
  );
}

interface TextProps {
  el: TextEl;
  onSelect: () => void;
  onChange: (attrs: Partial<StudioEl>) => void;
  onEdit: () => void;
  onDragMove?: DragMove;
  onDragEnd?: DragMove;
}

export function TextNodeView({ el, onSelect, onChange, onEdit, onDragMove, onDragEnd }: TextProps) {
  return (
    <KonvaText
      id={el.id}
      text={el.text}
      x={el.x}
      y={el.y}
      fontSize={el.fontSize}
      fill={el.fill}
      fontStyle={el.fontStyle}
      fontFamily={el.fontFamily}
      align={el.align}
      letterSpacing={el.letterSpacing}
      rotation={el.rotation}
      scaleX={el.scaleX}
      scaleY={el.scaleY}
      opacity={el.opacity ?? 1}
      visible={!el.hidden}
      listening={!el.hidden}
      draggable={!el.locked}
      shadowColor={el.shadow ? "rgba(0,0,0,0.6)" : undefined}
      shadowBlur={el.shadow ? 8 : 0}
      shadowOffsetX={el.shadow ? 2 : 0}
      shadowOffsetY={el.shadow ? 2 : 0}
      onClick={onSelect}
      onTap={onSelect}
      onDblClick={onEdit}
      onDblTap={onEdit}
      onDragMove={onDragMove}
      onDragEnd={(e) => {
        onChange({ x: e.target.x(), y: e.target.y() });
        onDragEnd?.(e);
      }}
      onTransformEnd={(e) => {
        const node = e.target;
        onChange({
          x: node.x(),
          y: node.y(),
          scaleX: node.scaleX(),
          scaleY: node.scaleY(),
          rotation: node.rotation(),
        });
      }}
    />
  );
}

interface ShapeProps {
  el: ShapeEl;
  onSelect: () => void;
  onChange: (attrs: Partial<StudioEl>) => void;
  onDragMove?: DragMove;
  onDragEnd?: DragMove;
}

export function ShapeNode({ el, onSelect, onChange, onDragMove, onDragEnd }: ShapeProps) {
  const common = {
    id: el.id,
    rotation: el.rotation,
    opacity: el.opacity ?? 1,
    visible: !el.hidden,
    listening: !el.hidden,
    draggable: !el.locked,
    onClick: onSelect,
    onTap: onSelect,
    onDragMove,
  };

  if (el.shape === "ellipse") {
    return (
      <Ellipse
        {...common}
        x={el.x + el.width / 2}
        y={el.y + el.height / 2}
        radiusX={el.width / 2}
        radiusY={el.height / 2}
        fill={el.fill}
        stroke={el.strokeWidth > 0 ? el.stroke : undefined}
        strokeWidth={el.strokeWidth}
        onDragEnd={(e) => {
          const n = e.target;
          onChange({ x: n.x() - el.width / 2, y: n.y() - el.height / 2 });
          onDragEnd?.(e);
        }}
        onTransformEnd={(e) => {
          const n = e.target;
          const w = Math.max(5, el.width * n.scaleX());
          const h = Math.max(5, el.height * n.scaleY());
          onChange({ width: w, height: h, x: n.x() - w / 2, y: n.y() - h / 2, rotation: n.rotation() });
          n.scaleX(1);
          n.scaleY(1);
        }}
      />
    );
  }

  if (el.shape === "line") {
    return (
      <Line
        {...common}
        x={el.x}
        y={el.y}
        points={[0, 0, el.width, 0]}
        stroke={el.stroke}
        strokeWidth={Math.max(el.strokeWidth, 1)}
        hitStrokeWidth={Math.max(el.strokeWidth, 12)}
        lineCap="round"
        onDragEnd={(e) => {
          const n = e.target;
          onChange({ x: n.x(), y: n.y() });
          onDragEnd?.(e);
        }}
        onTransformEnd={(e) => {
          const n = e.target;
          const w = Math.max(5, el.width * n.scaleX());
          onChange({ width: w, x: n.x(), y: n.y(), rotation: n.rotation() });
          n.scaleX(1);
          n.scaleY(1);
        }}
      />
    );
  }

  if (el.shape === "triangle") {
    return (
      <Line
        {...common}
        x={el.x}
        y={el.y}
        points={[el.width / 2, 0, el.width, el.height, 0, el.height]}
        closed
        fill={el.fill}
        stroke={el.strokeWidth > 0 ? el.stroke : undefined}
        strokeWidth={el.strokeWidth}
        onDragEnd={(e) => {
          const n = e.target;
          onChange({ x: n.x(), y: n.y() });
          onDragEnd?.(e);
        }}
        onTransformEnd={(e) => {
          const n = e.target;
          const w = Math.max(5, el.width * n.scaleX());
          const h = Math.max(5, el.height * n.scaleY());
          onChange({ width: w, height: h, x: n.x(), y: n.y(), rotation: n.rotation() });
          n.scaleX(1);
          n.scaleY(1);
        }}
      />
    );
  }

  return (
    <Rect
      {...common}
      x={el.x}
      y={el.y}
      width={el.width}
      height={el.height}
      cornerRadius={el.cornerRadius}
      fill={el.fill}
      stroke={el.strokeWidth > 0 ? el.stroke : undefined}
      strokeWidth={el.strokeWidth}
      onDragEnd={(e) => {
        const n = e.target;
        onChange({ x: n.x(), y: n.y() });
        onDragEnd?.(e);
      }}
      onTransformEnd={(e) => {
        const n = e.target;
        const w = Math.max(5, el.width * n.scaleX());
        const h = Math.max(5, el.height * n.scaleY());
        onChange({ width: w, height: h, x: n.x(), y: n.y(), rotation: n.rotation() });
        n.scaleX(1);
        n.scaleY(1);
      }}
    />
  );
}

// Renders a background image cover-fit inside the rounded clip group.
export function BgImageNode({ src }: { src: string }) {
  const image = useHTMLImage(src);
  if (!image) return null;
  const scale = Math.max(CANVAS_W / image.width, CANVAS_H / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  return (
    <KonvaImage
      image={image}
      x={(CANVAS_W - w) / 2}
      y={(CANVAS_H - h) / 2}
      width={w}
      height={h}
      listening={false}
    />
  );
}
