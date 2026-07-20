"use client"

import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"

export interface CircuitBackgroundProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode
  /** Pixel distance between adjacent nodes on the grid. Default 56. */
  gridSpacing?: number
  /** Dim trace + node color. Default sky cyan. */
  color?: string
  /** Bright pulse color (used for the glowing traveling dot). Default #22d3ee. */
  accentColor?: string
  /** Canvas background fill. Default near-black. */
  background?: string
  /** Number of signal pulses traveling along the board at once. Default 12. */
  pulseCount?: number
  /** Global animation speed multiplier. Default 1. */
  speed?: number
  /** Probability that any given adjacent node pair gets wired. 0–1. Default 0.55. */
  density?: number
}

interface Edge {
  points: { x: number; y: number }[]
  length: number
  segLengths: number[]
}

interface Pulse {
  edgeIndex: number
  progress: number
  speed: number
}

function toRgbTuple(hex: string): string {
  if (!hex.startsWith("#")) return hex
  let h = hex.slice(1)
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  const n = Number.parseInt(h, 16)
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`
}

export function CircuitBackground({
  className,
  children,
  gridSpacing = 56,
  color = "#0ea5e9",
  accentColor = "#22d3ee",
  background = "#05060a",
  pulseCount = 12,
  speed = 1,
  density = 0.55,
  ...props
}: CircuitBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    const ctx = canvas.getContext("2d", { alpha: true })
    if (!ctx) return

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const colorRgb = toRgbTuple(color)
    const accentRgb = toRgbTuple(accentColor)

    let width = 0
    let height = 0
    let dpr = 1
    let edges: Edge[] = []
    let pulses: Pulse[] = []
    let rafId = 0
    let running = false
    let lastFrame = 0

    const buildGraph = () => {
      const cols = Math.max(2, Math.floor(width / gridSpacing) + 1)
      const rows = Math.max(2, Math.floor(height / gridSpacing) + 1)
      const offsetX = (width - (cols - 1) * gridSpacing) / 2
      const offsetY = (height - (rows - 1) * gridSpacing) / 2
      const next: Edge[] = []

      const nodeAt = (c: number, r: number) => ({
        x: offsetX + c * gridSpacing,
        y: offsetY + r * gridSpacing,
      })

      const pushEdge = (pts: { x: number; y: number }[]) => {
        const segs: number[] = []
        let total = 0
        for (let i = 0; i < pts.length - 1; i++) {
          const dx = pts[i + 1].x - pts[i].x
          const dy = pts[i + 1].y - pts[i].y
          const len = Math.sqrt(dx * dx + dy * dy)
          segs.push(len)
          total += len
        }
        if (total > 0) next.push({ points: pts, length: total, segLengths: segs })
      }

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const a = nodeAt(c, r)
          if (c + 1 < cols && Math.random() < density) pushEdge([a, nodeAt(c + 1, r)])
          if (r + 1 < rows && Math.random() < density) pushEdge([a, nodeAt(c, r + 1)])
          if (c + 1 < cols && r + 1 < rows && Math.random() < density * 0.5) {
            const b = nodeAt(c + 1, r + 1)
            const corner = Math.random() < 0.5 ? nodeAt(c + 1, r) : nodeAt(c, r + 1)
            pushEdge([a, corner, b])
          }
        }
      }

      edges = next
    }

    const seedPulses = () => {
      if (edges.length === 0) { pulses = []; return }
      const target = Math.max(0, Math.floor(pulseCount))
      for (const p of pulses) {
        if (p.edgeIndex >= edges.length) {
          p.edgeIndex = Math.floor(Math.random() * edges.length)
          p.progress = Math.random()
        }
      }
      while (pulses.length < target) {
        pulses.push({
          edgeIndex: Math.floor(Math.random() * edges.length),
          progress: Math.random(),
          speed: 0.5 + Math.random() * 0.8,
        })
      }
      if (pulses.length > target) pulses.length = target
    }

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
      buildGraph()
      seedPulses()
    }

    const positionOnEdge = (edge: Edge, t: number) => {
      let remain = Math.max(0, Math.min(1, t)) * edge.length
      for (let i = 0; i < edge.segLengths.length; i++) {
        const segLen = edge.segLengths[i]
        if (remain <= segLen || i === edge.segLengths.length - 1) {
          const f = segLen === 0 ? 0 : remain / segLen
          const a = edge.points[i]
          const b = edge.points[i + 1]
          return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }
        }
        remain -= segLen
      }
      return edge.points[0]
    }

    const paint = () => {
      ctx.fillStyle = background
      ctx.fillRect(0, 0, width, height)

      ctx.strokeStyle = `rgba(${colorRgb},0.25)`
      ctx.lineWidth = 1
      ctx.lineCap = "square"
      ctx.lineJoin = "miter"
      ctx.beginPath()
      for (const edge of edges) {
        const p0 = edge.points[0]
        ctx.moveTo(p0.x, p0.y)
        for (let i = 1; i < edge.points.length; i++) {
          ctx.lineTo(edge.points[i].x, edge.points[i].y)
        }
      }
      ctx.stroke()

      ctx.fillStyle = `rgba(${colorRgb},0.55)`
      for (const edge of edges) {
        for (const pt of edge.points) ctx.fillRect(pt.x - 1, pt.y - 1, 2, 2)
      }

      ctx.lineCap = "round"
      for (const pulse of pulses) {
        const edge = edges[pulse.edgeIndex]
        if (!edge) continue
        const head = positionOnEdge(edge, pulse.progress)
        const tail = positionOnEdge(edge, Math.max(0, pulse.progress - 0.08))

        ctx.strokeStyle = `rgba(${accentRgb},0.45)`
        ctx.lineWidth = 1.6
        ctx.beginPath()
        ctx.moveTo(tail.x, tail.y)
        ctx.lineTo(head.x, head.y)
        ctx.stroke()

        ctx.shadowColor = accentColor
        ctx.shadowBlur = 10
        ctx.fillStyle = `rgba(${accentRgb},1)`
        ctx.beginPath()
        ctx.arc(head.x, head.y, 2.2, 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0
      }
    }

    const advance = (deltaMs: number) => {
      if (edges.length === 0) return
      const dt = deltaMs * 0.001 * speed
      for (const pulse of pulses) {
        const edge = edges[pulse.edgeIndex]
        if (!edge) continue
        pulse.progress += (dt * pulse.speed * 80) / Math.max(40, edge.length)
        if (pulse.progress >= 1) {
          pulse.edgeIndex = Math.floor(Math.random() * edges.length)
          pulse.progress = 0
          pulse.speed = 0.5 + Math.random() * 0.8
        }
      }
    }

    const step = () => {
      const now = performance.now()
      const delta = lastFrame === 0 ? 16 : Math.min(64, now - lastFrame)
      lastFrame = now
      advance(delta)
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
  }, [gridSpacing, color, accentColor, background, pulseCount, speed, density])

  return (
    <div className={cn("fixed inset-0 overflow-hidden", className)} ref={containerRef} {...props}>
      <canvas className="absolute inset-0 h-full w-full" ref={canvasRef} />
      {children && <div className="relative z-10 h-full w-full">{children}</div>}
    </div>
  )
}
