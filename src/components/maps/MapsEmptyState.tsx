export const MapsEmptyState = () => {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 py-16 text-center">
      <div className="text-4xl mb-3" aria-hidden>
        🗺️
      </div>
      <h3 className="font-medium text-foreground">No maps yet</h3>
      <p className="mt-1 text-sm text-muted-foreground max-w-xs">
        Upload your first orienteering map to get started.
      </p>
    </div>
  )
}
