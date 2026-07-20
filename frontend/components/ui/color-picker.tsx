"use client"

import Color from "color"
import { PipetteIcon } from "lucide-react"
import { Slider } from "radix-ui"
import {
  type ComponentProps,
  createContext,
  type HTMLAttributes,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

interface ColorPickerContextValue {
  hue: number
  saturation: number
  lightness: number
  alpha: number
  mode: string
  setHue: (hue: number) => void
  setSaturation: (saturation: number) => void
  setLightness: (lightness: number) => void
  setAlpha: (alpha: number) => void
  setMode: (mode: string) => void
}

const ColorPickerContext = createContext<ColorPickerContextValue | undefined>(undefined)

export const useColorPicker = () => {
  const context = useContext(ColorPickerContext)
  if (!context) {
    throw new Error("useColorPicker must be used within a ColorPickerProvider")
  }
  return context
}

export type ColorPickerProps = Omit<HTMLAttributes<HTMLDivElement>, "onChange"> & {
  value?: Parameters<typeof Color>[0]
  defaultValue?: Parameters<typeof Color>[0]
  onChange?: (hex: string) => void
}

export const ColorPicker = ({
  value,
  defaultValue = "#6366f1",
  onChange,
  className,
  ...props
}: ColorPickerProps) => {
  const toHsl = (v: Parameters<typeof Color>[0]) => {
    try {
      const c = Color(v)
      return { h: c.hue(), s: c.saturationl(), l: c.lightness(), a: c.alpha() * 100 }
    } catch {
      return null
    }
  }

  const init = toHsl(value) ?? toHsl(defaultValue) ?? { h: 0, s: 100, l: 50, a: 100 }

  const [hue, setHue] = useState(init.h)
  const [saturation, setSaturation] = useState(init.s)
  const [lightness, setLightness] = useState(init.l)
  const [alpha, setAlpha] = useState(init.a)
  const [mode, setMode] = useState("hex")

  // Sync controlled value
  useEffect(() => {
    if (!value) return
    const parsed = toHsl(value)
    if (!parsed) return
    setHue(parsed.h)
    setSaturation(parsed.s)
    setLightness(parsed.l)
    setAlpha(parsed.a)
  }, [value])

  // Notify parent with hex string
  useEffect(() => {
    if (!onChange) return
    const hex = Color.hsl(hue, saturation, lightness).alpha(alpha / 100).hex()
    onChange(hex)
  }, [hue, saturation, lightness, alpha, onChange])

  return (
    <ColorPickerContext.Provider
      value={{ hue, saturation, lightness, alpha, mode, setHue, setSaturation, setLightness, setAlpha, setMode }}
    >
      <div className={cn("flex size-full flex-col gap-4", className)} {...(props as any)} />
    </ColorPickerContext.Provider>
  )
}

export type ColorPickerSelectionProps = HTMLAttributes<HTMLDivElement>

export const ColorPickerSelection = memo(({ className, ...props }: ColorPickerSelectionProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [positionX, setPositionX] = useState(0)
  const [positionY, setPositionY] = useState(0)
  const { hue, setSaturation, setLightness } = useColorPicker()

  const backgroundGradient = useMemo(() => {
    return `linear-gradient(0deg, rgba(0,0,0,1), rgba(0,0,0,0)),
            linear-gradient(90deg, rgba(255,255,255,1), rgba(255,255,255,0)),
            hsl(${hue}, 100%, 50%)`
  }, [hue])

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      if (!(isDragging && containerRef.current)) return
      const rect = containerRef.current.getBoundingClientRect()
      const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
      const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
      setPositionX(x)
      setPositionY(y)
      setSaturation(x * 100)
      const topLightness = x < 0.01 ? 100 : 50 + 50 * (1 - x)
      setLightness(topLightness * (1 - y))
    },
    [isDragging, setSaturation, setLightness],
  )

  useEffect(() => {
    const handlePointerUp = () => setIsDragging(false)
    if (isDragging) {
      window.addEventListener("pointermove", handlePointerMove)
      window.addEventListener("pointerup", handlePointerUp)
    }
    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
    }
  }, [isDragging, handlePointerMove])

  return (
    <div
      className={cn("relative size-full cursor-crosshair rounded", className)}
      onPointerDown={e => {
        e.preventDefault()
        setIsDragging(true)
        handlePointerMove(e.nativeEvent)
      }}
      ref={containerRef}
      style={{ background: backgroundGradient }}
      {...(props as any)}
    >
      <div
        className="-translate-x-1/2 -translate-y-1/2 pointer-events-none absolute h-4 w-4 rounded-full border-2 border-white"
        style={{
          left: `${positionX * 100}%`,
          top: `${positionY * 100}%`,
          boxShadow: "0 0 0 1px rgba(0,0,0,0.5)",
        }}
      />
    </div>
  )
})
ColorPickerSelection.displayName = "ColorPickerSelection"

export type ColorPickerHueProps = ComponentProps<typeof Slider.Root>

export const ColorPickerHue = ({ className, ...props }: ColorPickerHueProps) => {
  const { hue, setHue } = useColorPicker()
  return (
    <Slider.Root
      className={cn("relative flex h-4 w-full touch-none", className)}
      max={360}
      onValueChange={([h]) => setHue(h)}
      step={1}
      value={[hue]}
      {...(props as any)}
    >
      <Slider.Track className="relative my-0.5 h-3 w-full grow rounded-full bg-[linear-gradient(90deg,#FF0000,#FFFF00,#00FF00,#00FFFF,#0000FF,#FF00FF,#FF0000)]">
        <Slider.Range className="absolute h-full" />
      </Slider.Track>
      <Slider.Thumb className="block h-4 w-4 rounded-full border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50" />
    </Slider.Root>
  )
}

export type ColorPickerAlphaProps = ComponentProps<typeof Slider.Root>

export const ColorPickerAlpha = ({ className, ...props }: ColorPickerAlphaProps) => {
  const { alpha, setAlpha } = useColorPicker()
  return (
    <Slider.Root
      className={cn("relative flex h-4 w-full touch-none", className)}
      max={100}
      onValueChange={([a]) => setAlpha(a)}
      step={1}
      value={[alpha]}
      {...(props as any)}
    >
      <Slider.Track
        className="relative my-0.5 h-3 w-full grow rounded-full"
        style={{
          background:
            'url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGAQYcAP3uCTZhw1gGGYhAGBZIA/nYDCgBDAm9BGDWAAJyRCgLaBCAAgXwixzAS0pgAAAABJRU5ErkJggg==") left center',
        }}
      >
        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-transparent to-black/50" />
        <Slider.Range className="absolute h-full rounded-full bg-transparent" />
      </Slider.Track>
      <Slider.Thumb className="block h-4 w-4 rounded-full border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50" />
    </Slider.Root>
  )
}

export type ColorPickerEyeDropperProps = ComponentProps<typeof Button>

export const ColorPickerEyeDropper = ({ className, ...props }: ColorPickerEyeDropperProps) => {
  const { setHue, setSaturation, setLightness, setAlpha } = useColorPicker()

  const handleEyeDropper = async () => {
    try {
      // @ts-expect-error - EyeDropper API is experimental
      const eyeDropper = new EyeDropper()
      const result = await eyeDropper.open()
      const color = Color(result.sRGBHex)
      setHue(color.hue())
      setSaturation(color.saturationl())
      setLightness(color.lightness())
      setAlpha(100)
    } catch (error) {
      console.error("EyeDropper failed:", error)
    }
  }

  return (
    <Button
      className={cn("shrink-0 text-muted-foreground", className)}
      onClick={handleEyeDropper}
      size="icon"
      type="button"
      variant="outline"
      {...(props as any)}
    >
      <PipetteIcon size={16} />
    </Button>
  )
}

export type ColorPickerOutputProps = ComponentProps<typeof SelectTrigger>

const formats = ["hex", "rgb", "hsl"]

export const ColorPickerOutput = ({ className, ...props }: ColorPickerOutputProps) => {
  const { mode, setMode } = useColorPicker()
  return (
    <Select onValueChange={setMode} value={mode}>
      <SelectTrigger className="h-8 w-20 shrink-0 text-xs" {...(props as any)}>
        <SelectValue placeholder="Mode" />
      </SelectTrigger>
      <SelectContent>
        {formats.map(format => (
          <SelectItem className="text-xs" key={format} value={format}>
            {format.toUpperCase()}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

type PercentageInputProps = ComponentProps<typeof Input>

const PercentageInput = ({ className, ...props }: PercentageInputProps) => (
  <div className="relative">
    <Input
      readOnly
      type="text"
      {...(props as any)}
      className={cn(
        "h-8 w-[3.25rem] rounded-l-none bg-secondary px-2 text-xs shadow-none",
        className,
      )}
    />
    <span className="-translate-y-1/2 absolute top-1/2 right-2 text-muted-foreground text-xs">%</span>
  </div>
)

export type ColorPickerFormatProps = HTMLAttributes<HTMLDivElement>

export const ColorPickerFormat = ({ className, ...props }: ColorPickerFormatProps) => {
  const { hue, saturation, lightness, alpha, mode } = useColorPicker()
  const color = Color.hsl(hue, saturation, lightness).alpha(alpha / 100)

  if (mode === "hex") {
    return (
      <div className={cn("-space-x-px relative flex w-full items-center rounded-md shadow-sm", className)} {...(props as any)}>
        <Input className="h-8 rounded-r-none bg-secondary px-2 text-xs shadow-none" readOnly type="text" value={color.hex()} />
        <PercentageInput value={alpha} />
      </div>
    )
  }

  if (mode === "rgb") {
    const rgb = color.rgb().array().map(v => Math.round(v))
    return (
      <div className={cn("-space-x-px flex items-center rounded-md shadow-sm", className)} {...(props as any)}>
        {rgb.map((v, i) => (
          <Input key={i} className={cn("h-8 rounded-r-none bg-secondary px-2 text-xs shadow-none", i && "rounded-l-none")} readOnly type="text" value={v} />
        ))}
        <PercentageInput value={alpha} />
      </div>
    )
  }

  if (mode === "hsl") {
    const hsl = color.hsl().array().map(v => Math.round(v))
    return (
      <div className={cn("-space-x-px flex items-center rounded-md shadow-sm", className)} {...(props as any)}>
        {hsl.map((v, i) => (
          <Input key={i} className={cn("h-8 rounded-r-none bg-secondary px-2 text-xs shadow-none", i && "rounded-l-none")} readOnly type="text" value={v} />
        ))}
        <PercentageInput value={alpha} />
      </div>
    )
  }

  return null
}
