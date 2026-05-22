const usdWhole = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const usdPrecise = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCurrency(
  amount: number | null | undefined,
  options: { precise?: boolean } = {},
): string {
  if (amount == null || !Number.isFinite(amount)) return "$0";
  return options.precise ? usdPrecise.format(amount) : usdWhole.format(amount);
}
