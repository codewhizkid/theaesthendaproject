import { EmailLinkForm } from "@/components/auth/email-link-form";

export default function ResendPage() {
  return <EmailLinkForm recovery={false} />;
}
