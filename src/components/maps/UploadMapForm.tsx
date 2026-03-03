'use client'

import { useActionState, useRef } from 'react'
import { uploadMapAction } from '@/server/maps/actions'

const ACCEPTED_EXTENSIONS = '.jpg,.jpeg,.png,.pdf,.tif,.tiff,.ocd,.omap'

export const UploadMapForm = () => {
  const [error, formAction, isPending] = useActionState(uploadMapAction, null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <form action={formAction} className="space-y-5">
      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      {/* Title */}
      <div className="space-y-1">
        <label htmlFor="title" className="block text-sm font-medium">
          Title <span className="text-destructive">*</span>
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          disabled={isPending}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          placeholder="e.g. Rommelsbachtal 2023"
        />
      </div>

      {/* Scale + Equidistance — side by side */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label htmlFor="scale" className="block text-sm font-medium">
            Scale <span className="text-destructive">*</span>
          </label>
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-muted-foreground">1 :</span>
            <input
              id="scale"
              name="scale"
              type="number"
              min="1"
              required
              disabled={isPending}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              placeholder="10000"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label htmlFor="equidistance" className="block text-sm font-medium">
            Equidistance (m)
          </label>
          <input
            id="equidistance"
            name="equidistance"
            type="number"
            min="0.1"
            step="0.5"
            disabled={isPending}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            placeholder="5"
          />
        </div>
      </div>

      {/* Year Updated + Cartographer — side by side */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label htmlFor="yearUpdated" className="block text-sm font-medium">
            Year last updated
          </label>
          <input
            id="yearUpdated"
            name="yearUpdated"
            type="number"
            min="1900"
            max={new Date().getFullYear()}
            disabled={isPending}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            placeholder={String(new Date().getFullYear())}
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="cartographer" className="block text-sm font-medium">
            Cartographer
          </label>
          <input
            id="cartographer"
            name="cartographer"
            type="text"
            disabled={isPending}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            placeholder="Name"
          />
        </div>
      </div>

      {/* Publisher */}
      <div className="space-y-1">
        <label htmlFor="publisher" className="block text-sm font-medium">
          Publisher
        </label>
        <input
          id="publisher"
          name="publisher"
          type="text"
          disabled={isPending}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          placeholder="Club or organisation"
        />
      </div>

      {/* File */}
      <div className="space-y-1">
        <label htmlFor="file" className="block text-sm font-medium">
          Map file <span className="text-destructive">*</span>
        </label>
        <input
          ref={fileInputRef}
          id="file"
          name="file"
          type="file"
          accept={ACCEPTED_EXTENSIONS}
          required
          disabled={isPending}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm file:mr-3 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs file:font-medium focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        />
        <p className="text-xs text-muted-foreground">JPG, PNG, PDF, GeoTIFF, OCD, OMAP</p>
      </div>

      <div className="flex items-center justify-end gap-3 pt-1">
        <a
          href="/maps"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </a>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
        >
          {isPending ? 'Uploading…' : 'Upload map'}
        </button>
      </div>
    </form>
  )
}
