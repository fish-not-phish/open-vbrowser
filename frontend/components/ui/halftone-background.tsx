"use client"

import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"

export interface HalftoneBackgroundProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode
  dotSpacing?: number
  maxRadius?: number
  color?: string
  background?: string
  speed?: number
  scale?: number
}

export function HalftoneBackground({
  className,
  children,
  dotSpacing = 14,
  maxRadius = 6,
  color = "#0ea5e9",
  background = "#fafafa",
  speed = 1,
  scale = 1,
  ...props
}: HalftoneBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    const ctx = canvas.getContext("2d", { alpha: true })
    if (!ctx) return

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches

    const spacing = Math.max(4, dotSpacing)
    const rMax = Math.max(0.5, maxRadius)
    const freq = 0.015 * scale

    let width = 0
    let height = 0
    let dpr = 1
    let rafId = 0
    let running = false
    let elapsed = 0
    let lastFrame = 0

    const resize = () => {
      const rect = container.getBoundingClientRect()
      width = rect.width
      height = rect.height
      dpr = window.devicePixelRatio || 1
      canvas.width = Math.max(1, Math.floor(width * dpr))
      canvas.height = Math.max(1, Math.floor(height * dpr))
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const paint = () => {
      const t = elapsed * 0.001 * speed

      ctx.fillStyle = background
      ctx.fillRect(0, 0, width, height)
      ctx.fillStyle = color

      const cx = width * (0.5 + 0.3 * Math.sin(t * 0.4))
      const cy = height * (0.5 + 0.3 * Math.cos(t * 0.6))

      const startX = spacing / 2
      const startY = spacing / 2

      for (let y = startY; y < height; y += spacing) {
        const wy = Math.sin(y * freq * 0.8 + t * 0.7) * 0.5 + 0.5
        for (let x = startX; x < width; x += spacing) {
          const dx = x - cx
          const dy = y - cy
          const radial = Math.sin(Math.hypot(dx, dy) * freq - t * 2) * 0.5 + 0.5
          const wave = Math.sin(x * freq + t) * 0.5 + 0.5
          const b = radial * 0.55 + wave * 0.3 + wy * 0.15
          const r = rMax * b
          if (r < 0.3) continue
          ctx.beginPath()
          ctx.arc(x, y, r, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }

    const step = () => {
      const now = performance.now()
      if (lastFrame !== 0) elapsed += now - lastFrame
      lastFrame = now
      paint()
      rafId = requestAnimationFrame(step)
    }

    const start = () => {
      if (running || prefersReduced) return
      running = true
      lastFrame = 0
      rafId = requestAnimationFrame(step)
    }

    const stop = () => {
      running = false
      lastFrame = 0
      cancelAnimationFrame(rafId)
    }

    resize()

    if (prefersReduced) {
      paint()
    } else {
      start()
    }

    const ro = new ResizeObserver(() => {
      stop()
      resize()
      if (prefersReduced) paint()
      else start()
    })
    ro.observe(container)

    const onVisibility = () => {
      if (document.hidden) stop()
      else start()
    }
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      stop()
      ro.disconnect()
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [dotSpacing, maxRadius, color, background, speed, scale])

  return (
    <div className={cn("fixed inset-0 overflow-hidden", className)} ref={containerRef} {...props}>
      <canvas className="absolute inset-0 h-full w-full" ref={canvasRef} />
      {children && <div className="relative z-10 h-full w-full">{children}</div>}
    </div>
  )
}
