import React, { useRef, useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";

export type WebcamPixelGridProps = {
  gridCols?: number;
  gridRows?: number;
  maxElevation?: number;
  motionSensitivity?: number;
  elevationSmoothing?: number;
  colorMode?: "webcam" | "monochrome";
  monochromeColor?: string;
  backgroundColor?: string;
  mirror?: boolean;
  gapRatio?: number;
  invertColors?: boolean;
  darken?: number;
  borderColor?: string;
  borderOpacity?: number;
  className?: string;
  onWebcamError?: (error: Error) => void;
  onWebcamReady?: () => void;
  showErrorUi?: boolean;
};

type PixelData = {
  r: number;
  g: number;
  b: number;
  motion: number;
  targetElevation: number;
  currentElevation: number;
};

export const WebcamPixelGrid: React.FC<WebcamPixelGridProps> = ({
  gridCols = 64,
  gridRows = 48,
  maxElevation = 15,
  motionSensitivity = 0.4,
  elevationSmoothing = 0.1,
  colorMode = "webcam",
  monochromeColor = "#ffffff",
  backgroundColor = "#000000",
  mirror = true,
  gapRatio = 0.1,
  invertColors = false,
  darken = 0,
  borderColor = "#ffffff",
  borderOpacity = 0.06,
  className,
  onWebcamError,
  onWebcamReady,
  showErrorUi = true,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const processingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previousFrameRef = useRef<Uint8ClampedArray | null>(null);
  const pixelDataRef = useRef<PixelData[][]>([]);
  const animationRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showErrorPopup, setShowErrorPopup] = useState(true);

  const monoRGB = React.useMemo(() => {
    const hex = monochromeColor.replace("#", "");
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }, [monochromeColor]);

  const borderRGB = React.useMemo(() => {
    const hex = borderColor.replace("#", "");
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }, [borderColor]);

  useEffect(() => {
    pixelDataRef.current = Array.from({ length: gridRows }, () =>
      Array.from({ length: gridCols }, () => ({
        r: 20,
        g: 20,
        b: 20,
        motion: 0,
        targetElevation: 0,
        currentElevation: 0,
      })),
    );
  }, [gridCols, gridRows]);

  const requestCameraAccess = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user",
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsReady(true);
        setError(null);
        setShowErrorPopup(false);
        onWebcamReady?.();
      }
    } catch (err) {
      const e = err instanceof Error ? err : new Error("Webcam access denied");
      setError(e.message);
      onWebcamError?.(e);
    }
  }, [onWebcamError, onWebcamReady]);

  useEffect(() => {
    requestCameraAccess();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [requestCameraAccess]);

  const render = useCallback(() => {
    const video = videoRef.current;
    const processingCanvas = processingCanvasRef.current;
    const displayCanvas = displayCanvasRef.current;

    if (!video || !processingCanvas || !displayCanvas || video.readyState < 2) {
      animationRef.current = requestAnimationFrame(render);
      return;
    }

    const procCtx = processingCanvas.getContext("2d", { willReadFrequently: true });
    const dispCtx = displayCanvas.getContext("2d");
    if (!procCtx || !dispCtx) {
      animationRef.current = requestAnimationFrame(render);
      return;
    }

    processingCanvas.width = gridCols;
    processingCanvas.height = gridRows;

    procCtx.save();
    if (mirror) {
      procCtx.scale(-1, 1);
      procCtx.drawImage(video, -gridCols, 0, gridCols, gridRows);
    } else {
      procCtx.drawImage(video, 0, 0, gridCols, gridRows);
    }
    procCtx.restore();

    const imageData = procCtx.getImageData(0, 0, gridCols, gridRows);
    const currentData = imageData.data;
    const previousData = previousFrameRef.current;

    const pixels = pixelDataRef.current;
    for (let row = 0; row < gridRows; row++) {
      for (let col = 0; col < gridCols; col++) {
        const idx = (row * gridCols + col) * 4;
        const r = currentData[idx];
        const g = currentData[idx + 1];
        const b = currentData[idx + 2];
        const pixel = pixels[row]?.[col];
        if (!pixel) continue;

        let motion = 0;
        if (previousData) {
          const diff =
            Math.abs(r - previousData[idx]) +
            Math.abs(g - previousData[idx + 1]) +
            Math.abs(b - previousData[idx + 2]);
          motion = Math.min(1, diff / 255 / motionSensitivity);
        }
        pixel.motion = pixel.motion * 0.7 + motion * 0.3;

        let finalR = r;
        let finalG = g;
        let finalB = b;

        if (colorMode === "monochrome") {
          const brightness = (r + g + b) / 3 / 255;
          finalR = Math.round(monoRGB.r * brightness);
          finalG = Math.round(monoRGB.g * brightness);
          finalB = Math.round(monoRGB.b * brightness);
        }
        if (invertColors) {
          finalR = 255 - finalR;
          finalG = 255 - finalG;
          finalB = 255 - finalB;
        }
        if (darken > 0) {
          const f = 1 - darken;
          finalR = Math.round(finalR * f);
          finalG = Math.round(finalG * f);
          finalB = Math.round(finalB * f);
        }

        pixel.r = finalR;
        pixel.g = finalG;
        pixel.b = finalB;
        pixel.targetElevation = pixel.motion * maxElevation;
        pixel.currentElevation +=
          (pixel.targetElevation - pixel.currentElevation) * elevationSmoothing;
      }
    }

    previousFrameRef.current = new Uint8ClampedArray(currentData);

    const dpr = window.devicePixelRatio || 1;
    const displayWidth = displayCanvas.clientWidth;
    const displayHeight = displayCanvas.clientHeight;
    displayCanvas.width = displayWidth * dpr;
    displayCanvas.height = displayHeight * dpr;
    dispCtx.scale(dpr, dpr);

    dispCtx.fillStyle = backgroundColor;
    dispCtx.fillRect(0, 0, displayWidth, displayHeight);

    const cellSize = Math.max(displayWidth / gridCols, displayHeight / gridRows);
    const gap = cellSize * gapRatio;
    const gridWidth = cellSize * gridCols;
    const gridHeight = cellSize * gridRows;
    const offsetXGrid = (displayWidth - gridWidth) / 2;
    const offsetYGrid = (displayHeight - gridHeight) / 2;

    for (let row = 0; row < gridRows; row++) {
      for (let col = 0; col < gridCols; col++) {
        const pixel = pixels[row]?.[col];
        if (!pixel) continue;
        const x = offsetXGrid + col * cellSize;
        const y = offsetYGrid + row * cellSize;
        const elevation = pixel.currentElevation;
        const offsetX = -elevation * 1.2;
        const offsetY = -elevation * 1.8;

        if (elevation > 0.5) {
          dispCtx.fillStyle = `rgba(0,0,0,${Math.min(0.6, elevation * 0.04)})`;
          dispCtx.fillRect(
            x + gap / 2 + elevation * 1.5,
            y + gap / 2 + elevation * 2.0,
            cellSize - gap,
            cellSize - gap,
          );

          dispCtx.fillStyle = `rgb(${Math.max(0, pixel.r - 80)},${Math.max(0, pixel.g - 80)},${Math.max(0, pixel.b - 80)})`;
          dispCtx.beginPath();
          dispCtx.moveTo(x + cellSize - gap / 2 + offsetX, y + gap / 2 + offsetY);
          dispCtx.lineTo(x + cellSize - gap / 2, y + gap / 2);
          dispCtx.lineTo(x + cellSize - gap / 2, y + cellSize - gap / 2);
          dispCtx.lineTo(x + cellSize - gap / 2 + offsetX, y + cellSize - gap / 2 + offsetY);
          dispCtx.closePath();
          dispCtx.fill();

          dispCtx.fillStyle = `rgb(${Math.max(0, pixel.r - 50)},${Math.max(0, pixel.g - 50)},${Math.max(0, pixel.b - 50)})`;
          dispCtx.beginPath();
          dispCtx.moveTo(x + gap / 2 + offsetX, y + cellSize - gap / 2 + offsetY);
          dispCtx.lineTo(x + gap / 2, y + cellSize - gap / 2);
          dispCtx.lineTo(x + cellSize - gap / 2, y + cellSize - gap / 2);
          dispCtx.lineTo(x + cellSize - gap / 2 + offsetX, y + cellSize - gap / 2 + offsetY);
          dispCtx.closePath();
          dispCtx.fill();
        }

        const brightness = 1 + elevation * 0.05;
        dispCtx.fillStyle = `rgb(${Math.min(255, Math.round(pixel.r * brightness))},${Math.min(255, Math.round(pixel.g * brightness))},${Math.min(255, Math.round(pixel.b * brightness))})`;
        dispCtx.fillRect(x + gap / 2 + offsetX, y + gap / 2 + offsetY, cellSize - gap, cellSize - gap);

        dispCtx.strokeStyle = `rgba(${borderRGB.r},${borderRGB.g},${borderRGB.b},${borderOpacity + elevation * 0.008})`;
        dispCtx.lineWidth = 0.5;
        dispCtx.strokeRect(x + gap / 2 + offsetX, y + gap / 2 + offsetY, cellSize - gap, cellSize - gap);
      }
    }

    animationRef.current = requestAnimationFrame(render);
  }, [
    gridCols, gridRows, mirror, motionSensitivity, colorMode, monoRGB,
    maxElevation, elevationSmoothing, backgroundColor, gapRatio,
    invertColors, darken, borderRGB, borderOpacity,
  ]);

  useEffect(() => {
    if (!isReady) return;
    animationRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationRef.current);
  }, [isReady, render]);

  return (
    <div className={cn("relative h-full w-full overflow-hidden", className)} style={{ backgroundColor }}>
      <video ref={videoRef} className="hidden" playsInline muted />
      <canvas ref={processingCanvasRef} className="hidden" />
      <canvas
        ref={displayCanvasRef}
        className="h-full w-full transition-opacity duration-700"
        style={{ opacity: isReady ? 1 : 0 }}
      />

      {showErrorUi && error && showErrorPopup && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-4">
          <div className="holo-panel relative max-w-sm rounded-2xl p-6 text-center text-white/80">
            <button
              onClick={() => setShowErrorPopup(false)}
              className="absolute right-2 top-2 rounded-md p-1 text-white/40 hover:text-white/70"
              aria-label="Dismiss"
            >
              ×
            </button>
            <h3 className="mb-1 text-sm font-medium text-white">Camera access needed</h3>
            <p className="mb-4 text-xs text-white/50">Enable camera for the reactive background</p>
            <button
              onClick={requestCameraAccess}
              className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"
            >
              Enable Camera
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default WebcamPixelGrid;