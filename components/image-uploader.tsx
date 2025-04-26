"use client"

import type React from "react"

import { useCallback, useRef, useState } from "react"
import { AlertCircle, Upload } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface ImageUploaderProps {
  onImageUpload: (imageData: string) => void
}

export function ImageUploader({ onImageUpload }: ImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragCount, setDragCount] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const validateFileType = (file: File): boolean => {
    const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml", "image/bmp"]
    if (!validTypes.includes(file.type)) {
      setError("Only image files are allowed (JPEG, PNG, GIF, WEBP, SVG, BMP)")
      toast.error("Only image files are allowed")
      return false
    }
    setError(null)
    return true
  }

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      if (!validateFileType(file)) {
        e.target.value = ""
        return
      }

      const reader = new FileReader()
      reader.onload = (e) => {
        onImageUpload(e.target?.result as string)
      }
      reader.readAsDataURL(file)
    },
    [onImageUpload],
  )

  const handleButtonClick = useCallback(() => {
    setError(null)
    fileInputRef.current?.click()
  }, [])

  const processFile = useCallback(
    (file: File) => {
      if (!validateFileType(file)) return

      const reader = new FileReader()
      reader.onload = (e) => {
        onImageUpload(e.target?.result as string)
      }
      reader.readAsDataURL(file)
    },
    [onImageUpload],
  )

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setDragCount((prev) => prev + 1)
    setIsDragging(true)
    setError(null)
  }, [])

  const handleDragLeave = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      setDragCount((prev) => prev - 1)
      if (dragCount - 1 === 0) {
        setIsDragging(false)
      }
    },
    [dragCount],
  )

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()

    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      const item = e.dataTransfer.items[0]
      if (item.kind === "file" && !item.type.startsWith("image/")) {
        e.dataTransfer.dropEffect = "none"
      } else {
        e.dataTransfer.dropEffect = "copy"
      }
    }
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)
      setDragCount(0)

      const files = e.dataTransfer.files
      if (files && files.length > 0) {
        const file = files[0]
        processFile(file)
      }
    },
    [processFile],
  )

  return (
    <div
      className={cn(
        "w-full h-full flex flex-col items-center justify-center transition-all duration-300 ease-in-out",
        isDragging ? "scale-105" : "",
        error ? "animate-shake" : "",
      )}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />

      {isDragging ? (
        <div className="w-full h-full border-2 border-dashed border-primary rounded-sm p-8 flex flex-col items-center justify-center bg-primary/5 cursor-pointer transition-all duration-300">
          <Upload className="size-6 text-primary mb-2" />
          <p className="text-xs font-medium text-primary">Drop image here</p>
        </div>
      ) : (
        <div className="flex flex-col items-star w-full gap-2">
          <Button
            variant="outline"
            onClick={handleButtonClick}
            className="text-xs cursor-pointer w-fit rounded-sm shadow-none h-fit"
          >
            <Upload className="size-3" />
            Upload
          </Button>

          {error && (
            <div className="flex items-center gap-1 mt-2 text-destructive">
              <AlertCircle className="size-3" />
              <p className="text-xs">{error}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
