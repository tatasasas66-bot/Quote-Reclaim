type AuditFaqProps = {
  onExpand: (questionId: string) => void;
};

const FAQS = [
  {
    id: "another-crm",
    question: "Is this another CRM?",
    answer:
      "No. Keep the estimating app, spreadsheet, or notebook you already use. This only helps you decide which quiet quote deserves the next text.",
    open: true,
  },
  {
    id: "every-quote",
    question: "Will every old quote come back?",
    answer:
      "No. Some quotes are dead. The point is to make one smart first move and give a quiet homeowner an easier way to answer.",
    open: true,
  },
  {
    id: "one-quote",
    question: "What if I only have one quiet estimate?",
    answer:
      "Run it. One quote still gets a recovery move, a window, a message, and a follow-up. Add two more anytime to rank which to text first.",
    open: false,
  },
  {
    id: "after-audit",
    question: "What happens after the free audit?",
    answer:
      "You get the first move free. If you want the next move - day-3 follow-up, reply branches, and the full recovery sequence - that's the $79/month product. No card to see your result. Cancel anytime.",
    open: false,
  },
  {
    id: "buy-more-leads",
    question: "Why not just buy more leads?",
    answer:
      "You can. But buying a lead while three paid-for estimates sit in your sent folder is paying twice for work you already did. Check the old ones first. Then buy leads if you still need them.",
    open: false,
  },
  {
    id: "customer-data",
    question: "Are customer names or phone numbers needed?",
    answer:
      "No. The diagnostic uses only quote amount and days quiet. Do not enter customer data.",
    open: false,
  },
  {
    id: "contact-homeowner",
    question: "Does the homeowner get contacted?",
    answer:
      "No. You get a message to review and send yourself. Nothing is sent from this page.",
    open: false,
  },
] as const;

export function AuditFaq({ onExpand }: AuditFaqProps) {
  return (
    <section
      data-testid="audit-faq"
      aria-labelledby="audit-faq-title"
      className="border-t border-line-strong pt-7"
    >
      <p className="text-xs font-black uppercase tracking-widest text-brand">
        Straight answers
      </p>
      <h3
        id="audit-faq-title"
        className="mt-2 text-2xl font-black text-ink-strong"
      >
        No trick behind the result.
      </h3>
      <div className="mt-5 divide-y divide-line-subtle border-y border-line-subtle">
        {FAQS.map((item) => (
          <details
            key={item.id}
            open={item.open}
            data-question-id={item.id}
            className="group py-5"
          >
            <summary
              onClick={(event) => {
                const details = event.currentTarget
                  .parentElement as HTMLDetailsElement;
                if (!details.open) onExpand(item.id);
              }}
              className="cursor-pointer list-none pr-8 font-bold text-ink-strong marker:hidden"
            >
              {item.question}
            </summary>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-muted">
              {item.answer}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
