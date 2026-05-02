// 8-rule "ស្មារតីអង្គភាព" (unit consciousness) doctrine.
// Order, ids, and labels are canonical — do not edit without updating the SOP
// document. The post-trade audit grading depends on rule_1..rule_8 keys.

export const SOP_RULES = [
  { id: 'rule_1', label: 'Market structure — 5M Liquidity Order Block identified' },
  { id: 'rule_2', label: 'Order flow imbalance ≥10% (buyer/seller dominance)' },
  { id: 'rule_3', label: '5M signal confirmation (Sn1P3r)' },
  { id: 'rule_4', label: 'Minimum 1:2 risk-to-reward' },
  { id: 'rule_5', label: 'Within 3 trades/day limit' },
  { id: 'rule_6', label: 'No high-impact news event active' },
  { id: 'rule_7', label: 'Hourly fundamentals reviewed' },
  { id: 'rule_8', label: 'BHUB sentiment checked (contra-signal if >65%)' },
];

export const SOP_RULE_IDS = SOP_RULES.map(r => r.id);

export function emptySopChecks() {
  return SOP_RULES.reduce((o, r) => {
    o[r.id] = { confirmed: false, note: '' };
    return o;
  }, {});
}
