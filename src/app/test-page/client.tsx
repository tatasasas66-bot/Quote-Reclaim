"use client";

import * as React from "react";
import {
  Badge,
  Button,
  ErrorBoundary,
  Input,
  Logo,
  Select,
  Spinner,
  useToast,
} from "@/components/ui";
import { formatCurrency } from "@/lib/utils/currency";

const TRADE_OPTIONS = [
  { value: "hvac", label: "HVAC" },
  { value: "plumbing", label: "Plumbing" },
  { value: "roofing", label: "Roofing" },
  { value: "electrical", label: "Electrical" },
  { value: "remodeling", label: "Remodeling" },
  { value: "general_contracting", label: "General Contracting" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-line-subtle bg-surface-1 p-6">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-ink-muted">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function ThrowingChild(): React.ReactElement {
  throw new Error("Intentional render error for ErrorBoundary preview.");
}

export function TestPageClient() {
  const { push } = useToast();
  const [errored, setErrored] = React.useState(false);

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-6 py-12">
      <header className="flex items-center justify-between">
        <Logo showWordmark />
        <Badge variant="warning">DEV ONLY · /test-page</Badge>
      </header>

      <h1 className="text-3xl font-bold text-ink-strong">
        Internal UI reference
      </h1>
      <p className="text-ink-muted">
        Visual smoke test for the UI primitives. Removed before launch.
      </p>

      <div className="grid gap-6 md:grid-cols-2">
        <Section title="Buttons">
          <div className="flex flex-wrap gap-2">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="success">Success</Button>
            <Button variant="google">Continue with Google</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
            <Button loading>Loading</Button>
            <Button disabled>Disabled</Button>
          </div>
        </Section>

        <Section title="Badges">
          <div className="flex flex-wrap gap-2">
            <Badge>Neutral</Badge>
            <Badge variant="success">Delivered</Badge>
            <Badge variant="warning">At risk</Badge>
            <Badge variant="danger">Failed</Badge>
            <Badge variant="brand">Sending</Badge>
            <Badge variant="money">Recovered</Badge>
          </div>
        </Section>

        <Section title="Inputs">
          <Input label="Work email" type="email" placeholder="you@business.com" required />
          <Input label="Estimate amount" defaultValue="4200" hint="Whole dollars" />
          <Input label="Phone" error="Enter a valid phone number." defaultValue="555" />
        </Section>

        <Section title="Select">
          <Select label="Trade" options={TRADE_OPTIONS} placeholder="Choose a trade" required />
        </Section>

        <Section title="Spinner & money">
          <div className="flex items-center gap-4">
            <Spinner />
            <span className="text-2xl font-bold text-money">
              {formatCurrency(47200)}
            </span>
            <span className="text-base text-ink-muted">
              {formatCurrency(1234.56, { precise: true })}
            </span>
          </div>
        </Section>

        <Section title="Toast">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => push({ title: "Recovery scheduled", description: "Message 1 sends tomorrow at 9:00 AM.", variant: "neutral" })}
            >
              Show neutral toast
            </Button>
            <Button
              variant="secondary"
              onClick={() => push({ title: "Job won", description: "$4,200 recovered.", variant: "success" })}
            >
              Show success toast
            </Button>
            <Button
              variant="secondary"
              onClick={() => push({ title: "Send failed", description: "Tap to retry.", variant: "danger" })}
            >
              Show danger toast
            </Button>
          </div>
        </Section>

        <Section title="Error boundary">
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" onClick={() => setErrored(true)}>
              Trigger error
            </Button>
            <Button variant="secondary" onClick={() => setErrored(false)}>
              Reset
            </Button>
          </div>
          <ErrorBoundary key={errored ? "boom" : "ok"}>
            {errored ? <ThrowingChild /> : <p className="text-ink-muted">Boundary is healthy.</p>}
          </ErrorBoundary>
        </Section>
      </div>
    </main>
  );
}
