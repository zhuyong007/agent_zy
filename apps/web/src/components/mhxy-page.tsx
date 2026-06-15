import type { FormEvent } from "react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  MhxyInventoryTransferInput,
  MhxyInventoryTransferRecord,
  MhxyPriceSnapshotInput,
  MhxyTradeCurrency,
  MhxyTradeInput
} from "@agent-zy/shared-types";

import {
  createMhxyInventoryTransfer,
  createMhxyPriceSnapshot,
  createMhxyTrade,
  fetchMhxyDashboard,
  setMhxyInventoryTarget,
  updateMhxyInventoryTransfer,
  updateMhxyTrade
} from "../api";
import {
  CommandRail,
  useHomeLayoutPreferences,
  useLiveClock,
  useThemePreference
} from "./dashboard-page";

const localDateTime = () => {
  const date = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000);
  return date.toISOString().slice(0, 16);
};
const money = (value: number | null) =>
  value === null ? "待估值" : `¥${value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const emptyTrade = (): MhxyTradeInput => ({
  type: "buy",
  itemName: "",
  quantity: 1,
  unitPrice: 0,
  currency: "rmb",
  feeRmb: 0,
  occurredAt: localDateTime(),
  serverName: "",
  characterName: "",
  note: ""
});

export function MhxyPage() {
  const queryClient = useQueryClient();
  const [themeKey, setThemeKey] = useThemePreference();
  const { layout } = useHomeLayoutPreferences();
  const [railExpanded, setRailExpanded] = useState(false);
  const [trade, setTrade] = useState<MhxyTradeInput>(emptyTrade);
  const [editingTradeId, setEditingTradeId] = useState<string | null>(null);
  const [snapshotCurrency, setSnapshotCurrency] = useState<MhxyTradeCurrency>("rmb");
  const [editingTransfer, setEditingTransfer] = useState<MhxyInventoryTransferRecord | null>(null);
  const query = useQuery({ queryKey: ["mhxy"], queryFn: fetchMhxyDashboard });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["mhxy"] });
  const tradeMutation = useMutation({
    mutationFn: () => editingTradeId ? updateMhxyTrade(editingTradeId, trade) : createMhxyTrade(trade),
    onSuccess: () => {
      setTrade(emptyTrade());
      setEditingTradeId(null);
      void refresh();
    }
  });
  const snapshotMutation = useMutation({
    mutationFn: createMhxyPriceSnapshot,
    onSuccess: () => void refresh()
  });
  const transferMutation = useMutation({
    mutationFn: (input: MhxyInventoryTransferInput) =>
      editingTransfer ? updateMhxyInventoryTransfer(editingTransfer.id, input) : createMhxyInventoryTransfer(input),
    onSuccess: () => {
      setEditingTransfer(null);
      void refresh();
    }
  });
  const targetMutation = useMutation({
    mutationFn: setMhxyInventoryTarget,
    onSuccess: () => void refresh()
  });

  const dashboard = query.data;
  const gameCoinAmount = trade.quantity * trade.unitPrice;
  const convertedRmb = gameCoinAmount * (trade.rmbPerGameCoinWan ?? 0);
  const gameCoinSellFee = trade.type === "sell" ? convertedRmb * 0.05 : 0;
  const error = [tradeMutation.error, snapshotMutation.error, transferMutation.error, targetMutation.error]
    .find((item) => item instanceof Error) as Error | undefined;

  function submitTrade(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    tradeMutation.mutate();
  }

  function field(name: keyof MhxyTradeInput, value: string | number) {
    setTrade((current) => ({ ...current, [name]: value }));
  }

  return (
    <main className="workspace mhxy-workspace">
      <CommandRail
        activeSection="mhxy"
        expanded={railExpanded}
        onToggle={() => setRailExpanded((value) => !value)}
        themeKey={themeKey}
        onThemeChange={setThemeKey}
        rightMeta={[]}
        clockLine={useLiveClock()}
        navigationLayout={layout}
      />
      <section className="mhxy-page mhxy-page--scrollable">
        <header className="mhxy-hero">
          <div>
            <p className="eyebrow">RMB MAIN LEDGER</p>
            <h1>梦幻西游交易主账本</h1>
            <p>游戏币保留成交比例，库存成本、已实现收益和浮盈统一按人民币计算。</p>
          </div>
          <div className="mhxy-summary">
            <span>库存成本<strong>{money(dashboard?.summary.inventoryCostRmb ?? 0)}</strong></span>
            <span>已实现收益<strong>{money(dashboard?.summary.realizedProfitRmb ?? 0)}</strong></span>
            <span>市场估值<strong>{money(dashboard?.summary.marketValueRmb ?? 0)}</strong></span>
            <span>未实现浮盈<strong>{money(dashboard?.summary.unrealizedProfitRmb ?? 0)}</strong></span>
          </div>
        </header>

        {error ? <p className="mhxy-error">{error.message}</p> : null}

        <div className="mhxy-grid">
          <form className="mhxy-card mhxy-form" data-form="trade" onSubmit={submitTrade}>
            <h2>{editingTradeId ? "编辑交易" : "记录买入 / 卖出"}</h2>
            <div className="mhxy-form-grid">
              <label>类型<select name="type" value={trade.type} onChange={(e) => field("type", e.target.value)}><option value="buy">买入</option><option value="sell">卖出</option></select></label>
              <label>交易币种<select name="currency" value={trade.currency} onChange={(e) => field("currency", e.target.value)}><option value="rmb">人民币</option><option value="gameCoin">游戏币</option></select></label>
              <label>道具名<input name="itemName" required value={trade.itemName} onChange={(e) => field("itemName", e.target.value)} /></label>
              <label>数量<input name="quantity" required type="number" min="1" step="1" value={trade.quantity} onChange={(e) => field("quantity", Number(e.target.value))} /></label>
              <label>{trade.currency === "rmb" ? "人民币单价" : "游戏币单价（万）"}<input name="unitPrice" required type="number" min="0" step="any" value={trade.unitPrice} onChange={(e) => field("unitPrice", Number(e.target.value))} /></label>
              {trade.currency === "gameCoin" ? <label>兑换比例（1 万 = 人民币）<input name="rmbPerGameCoinWan" required type="number" min="0.000001" step="any" value={trade.rmbPerGameCoinWan ?? ""} onChange={(e) => field("rmbPerGameCoinWan", Number(e.target.value))} /></label> : <label>人民币手续费<input name="feeRmb" type="number" min="0" step="any" value={trade.feeRmb ?? 0} onChange={(e) => field("feeRmb", Number(e.target.value))} /></label>}
              <label>发生时间<input name="occurredAt" type="datetime-local" required value={trade.occurredAt.slice(0, 16)} onChange={(e) => field("occurredAt", e.target.value)} /></label>
              <label>区服<input name="serverName" value={trade.serverName ?? ""} onChange={(e) => field("serverName", e.target.value)} /></label>
              <label>角色<input name="characterName" value={trade.characterName ?? ""} onChange={(e) => field("characterName", e.target.value)} /></label>
              <label className="mhxy-wide">备注<input name="note" value={trade.note ?? ""} onChange={(e) => field("note", e.target.value)} /></label>
            </div>
            {trade.currency === "gameCoin" ? <div className="mhxy-conversion"><strong>本次交易：{gameCoinAmount} 万游戏币</strong><span>当前比例：1 万 = {trade.rmbPerGameCoinWan ?? 0} 元</span><span>折合人民币：{convertedRmb.toFixed(2)} 元</span>{trade.type === "sell" ? <span>固定手续费：{gameCoinSellFee.toFixed(2)} 元 · 预计实收 {(convertedRmb - gameCoinSellFee).toFixed(2)} 元</span> : null}</div> : null}
            <button type="submit" disabled={tradeMutation.isPending}>{editingTradeId ? "保存并重新推导" : "记录交易"}</button>
          </form>

          <SnapshotForm currency={snapshotCurrency} setCurrency={setSnapshotCurrency} submit={(input) => snapshotMutation.mutate(input)} />
          <TransferForm
            key={editingTransfer?.id ?? "new-transfer"}
            submit={(input) => transferMutation.mutate(input)}
            editing={editingTransfer}
          />
        </div>

        <section className="mhxy-card">
          <h2>当前库存与人民币估值</h2>
          <div className="mhxy-table">
            <div className="mhxy-row mhxy-row--head"><span>道具 / 持仓</span><span>数量</span><span>人民币成本</span><span>市场估值</span><span>预期卖出区服</span></div>
            {(dashboard?.inventory ?? []).map((item) => <div className="mhxy-row" key={`${item.itemName}-${item.serverName}-${item.characterName}`}><span><strong>{item.itemName}</strong><small>{item.serverName || "未填区服"} · {item.characterName || "未填角色"}</small></span><span>{item.quantity}</span><span>{money(item.inventoryCostRmb)}<small>均价 {money(item.averageUnitCostRmb)}</small></span><span>{money(item.marketValueRmb)}<small>浮盈 {money(item.unrealizedProfitRmb)}</small></span><span><input defaultValue={item.expectedSellServerName} onBlur={(e) => targetMutation.mutate({ itemName: item.itemName, serverName: item.serverName, characterName: item.characterName, expectedSellServerName: e.target.value })} /></span></div>)}
          </div>
        </section>

        <section className="mhxy-card">
          <h2>交易记录</h2>
          <div className="mhxy-history">{(dashboard?.trades ?? []).map((item) => {
            const result = dashboard?.tradeResults.find((entry) => entry.tradeId === item.id);
            return <article key={item.id}><div><strong>{item.type === "buy" ? "买入" : "卖出"}｜{item.itemName}｜{item.quantity} 个</strong><p>{item.currency === "gameCoin" ? `${item.gameCoinAmountWan} 万游戏币｜1 万=${item.rmbPerGameCoinWan} 元｜折合 ${money(item.rmbAmount)}` : `人民币 ${money(item.rmbAmount)}`}｜手续费 {money(item.feeRmb)}{result ? `｜已实现收益 ${money(result.realizedProfitRmb)}` : ""}</p></div><button type="button" onClick={() => { setEditingTradeId(item.id); setTrade(item); }}>编辑</button></article>;
          })}</div>
        </section>

        <div className="mhxy-grid mhxy-grid--history">
          <section className="mhxy-card">
            <h2>价格快照</h2>
            <div className="mhxy-history">{(dashboard?.priceSnapshots ?? []).map((item) => <article key={item.id}><div><strong>{item.itemName}｜{item.serverName || "未填区服"}</strong><p>{item.currency === "gameCoin" ? `${item.gameCoinUnitPriceWan} 万游戏币｜1 万=${item.rmbPerGameCoinWan} 元` : "人民币价格"}｜人民币单价 {money(item.rmbUnitPrice)}</p></div></article>)}</div>
          </section>
          <section className="mhxy-card">
            <h2>库存转移记录</h2>
            <div className="mhxy-history">{(dashboard?.inventoryTransfers ?? []).map((item) => <article key={item.id}><div><strong>{item.itemName}｜{item.quantity} 个</strong><p>{item.sourceServerName}/{item.sourceCharacterName} → {item.targetServerName}/{item.targetCharacterName}｜转移成本 {money(item.transferCostRmb)}</p></div><button type="button" onClick={() => setEditingTransfer(item)}>编辑</button></article>)}</div>
          </section>
        </div>
      </section>
    </main>
  );
}

function SnapshotForm({ currency, setCurrency, submit }: { currency: MhxyTradeCurrency; setCurrency: (value: MhxyTradeCurrency) => void; submit: (input: MhxyPriceSnapshotInput) => void }) {
  return <form className="mhxy-card mhxy-form" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); submit({ itemName: String(data.get("itemName")), serverName: String(data.get("serverName")), currency, ...(currency === "rmb" ? { rmbUnitPrice: Number(data.get("price")) } : { gameCoinUnitPriceWan: Number(data.get("price")), rmbPerGameCoinWan: Number(data.get("rate")) }), capturedAt: String(data.get("capturedAt")) }); event.currentTarget.reset(); }}><h2>记录价格快照</h2><label>币种<select value={currency} onChange={(e) => setCurrency(e.target.value as MhxyTradeCurrency)}><option value="rmb">人民币</option><option value="gameCoin">游戏币</option></select></label><label>道具名<input name="itemName" required /></label><label>区服<input name="serverName" required /></label><label>{currency === "rmb" ? "人民币单价" : "游戏币单价（万）"}<input name="price" type="number" min="0" step="any" required /></label>{currency === "gameCoin" ? <label>兑换比例<input name="rate" type="number" min="0.000001" step="any" required /></label> : null}<label>快照时间<input name="capturedAt" type="datetime-local" defaultValue={localDateTime()} required /></label><button type="submit">保存快照</button></form>;
}

function TransferForm({ submit, editing }: { submit: (input: MhxyInventoryTransferInput) => void; editing: MhxyInventoryTransferRecord | null }) {
  return <form className="mhxy-card mhxy-form" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); submit({ itemName: String(data.get("itemName")), quantity: Number(data.get("quantity")), sourceServerName: String(data.get("sourceServerName")), sourceCharacterName: String(data.get("sourceCharacterName")), targetServerName: String(data.get("targetServerName")), targetCharacterName: String(data.get("targetCharacterName")), transferCostRmb: Number(data.get("transferCostRmb")), occurredAt: String(data.get("occurredAt")) }); if (!editing) event.currentTarget.reset(); }}><h2>{editing ? "编辑库存转移" : "跨服库存转移"}</h2><label>道具名<input name="itemName" defaultValue={editing?.itemName} required /></label><label>数量<input name="quantity" type="number" min="1" step="1" defaultValue={editing?.quantity} required /></label><label>源区服<input name="sourceServerName" defaultValue={editing?.sourceServerName} required /></label><label>源角色<input name="sourceCharacterName" defaultValue={editing?.sourceCharacterName} required /></label><label>目标区服<input name="targetServerName" defaultValue={editing?.targetServerName} required /></label><label>目标角色<input name="targetCharacterName" defaultValue={editing?.targetCharacterName} required /></label><label>人民币转移成本<input name="transferCostRmb" type="number" min="0" step="any" defaultValue={editing?.transferCostRmb} required /></label><label>发生时间<input name="occurredAt" type="datetime-local" defaultValue={editing?.occurredAt.slice(0, 16) ?? localDateTime()} required /></label><button type="submit">{editing ? "保存并重新推导" : "保存转移"}</button></form>;
}
