import { WebcamPixelGrid } from "@/components/ui/webcam-pixel-grid";

export function PixelGridBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0">
      <div className="absolute inset-0">
        <WebcamPixelGrid
          gridCols={60}
          gridRows={40}
          maxElevation={50}
          motionSensitivity={0.25}
          elevationSmoothing={0.2}
          colorMode="webcam"
          backgroundColor="#030303"
          mirror
          gapRatio={0.05}
          darken={0.6}
          borderColor="#ffffff"
          borderOpacity={0.06}
          showErrorUi={false}
          onWebcamError={() => {}}
        />
      </div>
      {/* Light gradient vignette only — no blur so the pixel grid stays sharp */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.6) 80%, rgba(0,0,0,0.82) 100%)",
        }}
      />
    </div>
  );
}

export default PixelGridBackground;