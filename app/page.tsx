import { Clyp } from "@/components/screenshot-beautifier"

export default function Home() {
  return (
    <main className="min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-sm font-medium">clyp</h1>
          <p className="text-xs text-muted-foreground">
            Upload or paste your screenshot and customize it with beautiful backgrounds and styling
          </p>
        </div>
        <Clyp />
      </div>
    </main>
  )
}
