import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { Languages } from "lucide-react";

export function LangToggle() {
  const { lang, toggle } = useI18n();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={toggle}
      className="gap-2 font-semibold"
      aria-label="Toggle language"
    >
      <Languages className="size-4" />
      {lang === "en" ? "हिं" : "EN"}
    </Button>
  );
}
