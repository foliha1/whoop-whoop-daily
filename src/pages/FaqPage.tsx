import React from "react";
import { Helmet } from "react-helmet-async";
import LegalPage, { LegalSection, LegalText, LegalList, MailLink } from "@/components/LegalPage";
import { FAQ_ITEMS, FAQ_JSON_LD } from "@/content/faq.mjs";

export { FAQ_ITEMS } from "@/content/faq.mjs";

const FaqPage: React.FC = () => (
  <>
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(FAQ_JSON_LD)}</script>
    </Helmet>
    <LegalPage
      title="Frequently Asked Questions"
      metaTitle="FAQ — WHOOP! WHOOP! Memory Game"
      metaDescription="How the free WHOOP! WHOOP! Daily memory game works, whether you need an account, and how it relates to the WHOOP fitness tracker (it doesn't)."
      path="/faq"
      updated="October 18, 2026"
    >
      <LegalText>Everything you need to know about WHOOP! WHOOP!</LegalText>
      {FAQ_ITEMS.map((item) => (
        <LegalSection key={item.q} heading={item.q}>
          <LegalText>{item.a}</LegalText>
          {item.list ? <LegalList items={item.list} /> : null}
        </LegalSection>
      ))}
      <LegalSection heading="Have more questions?">
        <LegalText>
          Reach out to <MailLink />.
        </LegalText>
      </LegalSection>
    </LegalPage>
  </>
);

export default FaqPage;
