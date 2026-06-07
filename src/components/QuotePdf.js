import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

const BLUE  = "#0369a1";
const GRAY  = "#6b7280";
const DARK  = "#111827";
const LIGHT = "#f9fafb";

const s = StyleSheet.create({
  page:      { padding: 45, fontSize: 9, color: DARK, lineHeight: 1.5 },
  row:       { flexDirection: "row" },
  divider:   { borderBottom: "1pt solid #e5e7eb", marginVertical: 14 },
  // Header
  bigTitle:  { fontSize: 26, color: BLUE, fontFamily: "Helvetica-Bold", marginBottom: 16 },
  metaLabel: { color: BLUE, fontFamily: "Helvetica-Bold", width: 56, marginBottom: 3 },
  metaVal:   { marginBottom: 3 },
  bizName:   { fontFamily: "Helvetica-Bold", fontSize: 11, color: BLUE, textAlign: "right", marginBottom: 4 },
  bizLine:   { textAlign: "right", marginBottom: 2 },
  // Letter
  para:      { marginBottom: 8 },
  // Services
  secTitle:     { fontFamily: "Helvetica-Bold", fontSize: 10, color: BLUE, marginBottom: 6 },
  subSecTitle:  { fontFamily: "Helvetica-Bold", fontSize: 8, color: BLUE, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8 },
  thRow:     { flexDirection: "row", backgroundColor: LIGHT, paddingVertical: 5, paddingHorizontal: 6, marginBottom: 2 },
  th:        { fontFamily: "Helvetica-Bold", fontSize: 8, color: GRAY },
  tdRow:     { flexDirection: "row", borderBottom: "0.5pt solid #f3f4f6", paddingVertical: 5, paddingHorizontal: 4 },
  // Notes
  noteTitle: { fontFamily: "Helvetica-Bold", fontSize: 9, color: BLUE, marginBottom: 5 },
  note:      { color: GRAY, marginBottom: 4, fontSize: 8.5 },
});

const fmt = (d) =>
  new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

export default function QuotePdf({ quote, services = [], customer, job, business, hourlyRate = 0, calloutCharge = 0 }) {
  const vatRegistered = business?.vat_registered || false;
  const hrRate        = parseFloat(hourlyRate) || 0;
  const fmtGbp        = (n) => `£${n.toFixed(2)}`;

  const calloutDisplay = vatRegistered ? calloutCharge * 1.20 : calloutCharge;

  const totalLabour = calloutDisplay + services.reduce((sum, sv) => {
    const svQty = parseInt(sv.quantity) || 1;
    const hours = parseFloat(sv.service?.hours) || 0;
    const labSub = hours * svQty * hrRate;
    return sum + (vatRegistered ? labSub * 1.20 : labSub);
  }, 0);
  const totalMat = services.reduce((sum, sv) => {
    const svQty = parseInt(sv.quantity) || 1;
    const matSub = (sv.materials || []).reduce((ms, m) => {
      const base = parseFloat(m.base_price_no_vat) || 0;
      const mu   = parseFloat(m.markup) || 0;
      const mQty = parseInt(m.qty) || 1;
      return ms + base * (1 + mu / 100) * mQty;
    }, 0) * svQty;
    return sum + matSub * 1.20;
  }, 0);
  const grandTotal = totalLabour + totalMat;

  const custName  = [customer?.first_name, customer?.last_name].filter(Boolean).join(" ") || "Valued Customer";
  const firstName = customer?.first_name || "there";

  const custAddr = [
    customer?.address_line1, customer?.address_line2,
    customer?.town_city, customer?.county, customer?.postcode,
  ].filter(Boolean);

  const bizAddr = [
    business?.business_first_line, business?.business_second_line,
    business?.business_towncity, business?.business_postcode,
  ].filter(Boolean);

  const bizName = business?.business_name || "";

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* ── Big heading ── */}
        <Text style={s.bigTitle}>Quotation</Text>

        {/* ── Two-column header ── */}
        <View style={[s.row, { marginBottom: 16 }]}>

          {/* Left — meta + customer address */}
          <View style={{ flex: 1 }}>
            <View style={s.row}><Text style={s.metaLabel}>Reference:</Text><Text style={s.metaVal}>{quote?.quote_number != null ? String(quote.quote_number).padStart(4, "0") : "—"}</Text></View>
            <View style={s.row}><Text style={s.metaLabel}>Date:</Text>      <Text style={s.metaVal}>{fmt(quote?.sent_at || quote?.created_at)}</Text></View>
            <View style={s.row}><Text style={s.metaLabel}>Valid for:</Text> <Text style={s.metaVal}>30 days</Text></View>

            <View style={{ marginTop: 10 }}>
              <Text style={[s.metaLabel, { width: "auto", marginBottom: 5 }]}>To:</Text>
              <Text style={{ marginBottom: 2 }}>{custName}</Text>
              {custAddr.map((l, i) => <Text key={i} style={{ marginBottom: 1 }}>{l}</Text>)}
            </View>
          </View>

          {/* Right — business details */}
          <View style={{ flex: 1 }}>
            {bizName ? <Text style={s.bizName}>{bizName}</Text> : null}
            {bizAddr.map((l, i) => <Text key={i} style={s.bizLine}>{l}</Text>)}
            {business?.phone   && <Text style={[s.bizLine, { marginTop: 6 }]}>{business.phone}</Text>}
            {business?.email   && <Text style={s.bizLine}>{business.email}</Text>}
            {business?.website && <Text style={s.bizLine}>{business.website}</Text>}
            {business?.company_reg_number && (
              <Text style={[s.bizLine, { marginTop: 4 }]}>Company #: {business.company_reg_number}</Text>
            )}
            {business?.vat_number && (
              <Text style={s.bizLine}>VAT #: {business.vat_number}</Text>
            )}
          </View>
        </View>

        <View style={s.divider} />

        {/* ── Cover letter ── */}
        <View style={{ marginBottom: 14 }}>
          <Text style={s.para}>Dear {firstName},</Text>
          <Text style={s.para}>I hope this message finds you well.</Text>
          <Text style={s.para}>
            Thank you for considering {bizName || "us"} and for the opportunity to quote for your project.
          </Text>
          <Text style={s.para}>
            Please find attached a detailed quote outlining the proposed work. If you have any questions or
            would like to discuss anything in more detail, please don't hesitate to get in touch.
          </Text>
          <Text style={s.para}>
            If you would like to proceed, simply reply to this email and we will be in touch to arrange a
            convenient start date.
          </Text>
          <Text style={[s.para, { marginTop: 8 }]}>Many thanks</Text>
          <Text style={s.para}>{bizName}</Text>
        </View>

        <View style={s.divider} />

        {/* ── Scope of Works ── */}
        <Text style={s.secTitle}>{quote?.title || "Scope of Works"}</Text>
        {quote?.description ? <Text style={[s.para, { marginBottom: 10 }]}>{quote.description}</Text> : null}

        <View style={{ borderBottom: "1.5pt solid #d1d5db", marginBottom: 10 }} />

        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 10, color: BLUE, marginBottom: 4 }}>Services</Text>

        {/* Callout Charge — always first */}
        {calloutCharge > 0 && (
          <View style={[s.tdRow, { flexDirection: "column", paddingVertical: 8 }]}>
            <View style={[s.row, { justifyContent: "space-between", marginBottom: 3 }]}>
              <Text style={{ fontFamily: "Helvetica-Bold", flex: 1 }}>Callout Charge</Text>
            </View>
            <View>
              <Text style={{ fontSize: 8.5, fontFamily: "Helvetica-Bold", color: DARK }}>Pricing:</Text>
              <View style={{ marginLeft: 8, marginTop: 2 }}>
                <View style={[s.row, { justifyContent: "space-between", marginBottom: 2 }]}>
                  <Text style={{ fontSize: 8, color: DARK }}>Callout Charge{vatRegistered ? " (inc. 20% VAT)" : ""}</Text>
                  <Text style={{ fontSize: 8 }}>{fmtGbp(calloutDisplay)}</Text>
                </View>
                <View style={[s.row, { justifyContent: "space-between" }]}>
                  <Text style={{ fontSize: 8.5, fontFamily: "Helvetica-Bold" }}>Total</Text>
                  <Text style={{ fontSize: 8.5, fontFamily: "Helvetica-Bold" }}>{fmtGbp(calloutDisplay)}</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {services.map((sv, i) => {
          const svQty     = parseInt(sv.quantity) || 1;
          const matNames  = (sv.materials || []).map(m => m.name).filter(Boolean);
          const hours     = parseFloat(sv.service?.hours) || 0;
          const svcLabSub = hours * svQty * hrRate;
          const svcLabour = vatRegistered ? svcLabSub * 1.20 : svcLabSub;
          const svcMatSub = (sv.materials || []).reduce((ms, m) => {
            const base = parseFloat(m.base_price_no_vat) || 0;
            const mu   = parseFloat(m.markup) || 0;
            const mQty = parseInt(m.qty) || 1;
            return ms + base * (1 + mu / 100) * mQty;
          }, 0) * svQty;
          const svcMat    = svcMatSub * 1.20;
          const svcTotal  = svcLabour + svcMat;
          const hasPricing = svcLabour > 0 || svcMat > 0;

          return (
            <View key={i} style={[s.tdRow, { flexDirection: "column", paddingVertical: 8 }]}>
              {/* Service header row */}
              <View style={[s.row, { justifyContent: "space-between", marginBottom: 3 }]}>
                <Text style={{ fontFamily: "Helvetica-Bold", flex: 1 }}>{sv.service?.title || "—"}</Text>
                <Text style={{ color: GRAY, width: 36, textAlign: "right" }}>×{svQty}</Text>
              </View>
              {sv.task ? <Text style={{ color: GRAY, fontSize: 8.5, marginBottom: 4 }}>{sv.task}</Text> : null}

              {/* Materials */}
              {matNames.length > 0 && (
                <View style={{ marginBottom: hasPricing ? 5 : 0 }}>
                  <Text style={{ fontSize: 8.5, fontFamily: "Helvetica-Bold", color: DARK }}>Materials:</Text>
                  {matNames.map((name, mi) => (
                    <Text key={mi} style={{ fontSize: 8.5, color: DARK, marginLeft: 8, marginTop: 1 }}>{name}</Text>
                  ))}
                </View>
              )}

              {/* Pricing */}
              {hasPricing && (
                <View>
                  <Text style={{ fontSize: 8.5, fontFamily: "Helvetica-Bold", color: DARK }}>Pricing:</Text>
                  <View style={{ marginLeft: 8, marginTop: 2 }}>
                    {svcLabour > 0 && (
                      <View style={[s.row, { justifyContent: "space-between", marginBottom: 2 }]}>
                        <Text style={{ fontSize: 8, color: DARK }}>Labour{vatRegistered ? " (inc. 20% VAT)" : ""}</Text>
                        <Text style={{ fontSize: 8 }}>{fmtGbp(svcLabour)}</Text>
                      </View>
                    )}
                    {svcMat > 0 && (
                      <View style={[s.row, { justifyContent: "space-between", marginBottom: 2 }]}>
                        <Text style={{ fontSize: 8, color: GRAY }}>Materials (inc. 20% VAT)</Text>
                        <Text style={{ fontSize: 8 }}>{fmtGbp(svcMat)}</Text>
                      </View>
                    )}
                    <View style={[s.row, { justifyContent: "space-between" }]}>
                      <Text style={{ fontSize: 8.5, fontFamily: "Helvetica-Bold" }}>Total</Text>
                      <Text style={{ fontSize: 8.5, fontFamily: "Helvetica-Bold" }}>{fmtGbp(svcTotal)}</Text>
                    </View>
                  </View>
                </View>
              )}
            </View>
          );
        })}

        {/* ── Price Breakdown ── */}
        {(totalLabour > 0 || totalMat > 0) && (
          <View style={{ borderTop: "1.5pt solid #e5e7eb", paddingTop: 10, paddingBottom: 10, marginTop: 4 }}>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 10, color: BLUE, marginBottom: 8 }}>Total Price Breakdown</Text>
            {totalLabour > 0 && (
              <View style={[s.row, { justifyContent: "space-between", marginBottom: 4 }]}>
                <Text style={{ fontSize: 9 }}>Labour{vatRegistered ? " (inc. 20% VAT)" : ""}</Text>
                <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold" }}>{fmtGbp(totalLabour)}</Text>
              </View>
            )}
            {totalMat > 0 && (
              <View style={[s.row, { justifyContent: "space-between", marginBottom: 4 }]}>
                <Text style={{ fontSize: 9 }}>Materials (inc. 20% VAT)</Text>
                <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold" }}>{fmtGbp(totalMat)}</Text>
              </View>
            )}
            <View style={{ borderTop: "0.5pt solid #e5e7eb", paddingTop: 6, marginTop: 2 }}>
              <View style={[s.row, { justifyContent: "space-between" }]}>
                <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold" }}>Total</Text>
                <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold" }}>{fmtGbp(grandTotal)}</Text>
              </View>
            </View>
          </View>
        )}

        <View style={s.divider} />

        {/* ── Notes ── */}
        <Text style={s.noteTitle}>Notes</Text>
        <Text style={s.note}>
          Where applicable, a full works certificate will be issued once the invoice has been paid in full.
        </Text>
        <Text style={s.note}>
          Where applicable, we will require a deposit of 50% of the quotation value, once the quotation has been accepted.
        </Text>

      </Page>
    </Document>
  );
}
