import type { FormEvent } from "react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  MhxyAssetFlipCategory,
  MhxyAssetFlipInput,
  MhxyAssetFlipRecord,
  MhxyAssetFlipStatus,
  MhxyGameCoinPurchaseInput,
  MhxyGameCoinPurchaseRecord,
  MhxyInventoryTransferInput,
  MhxyInventoryTransferRecord,
  MhxyPriceSnapshotInput,
  MhxyTradeCurrency,
  MhxyTradeInput
} from "@agent-zy/shared-types";

import {
  createMhxyAssetFlip,
  createMhxyGameCoinPurchase,
  createMhxyInventoryTransfer,
  createMhxyPriceSnapshot,
  createMhxyTrade,
  deleteMhxyAssetFlip,
  deleteMhxyGameCoinPurchase,
  deleteMhxyInventoryTransfer,
  deleteMhxyPriceSnapshot,
  deleteMhxyTrade,
  fetchMhxyDashboard,
  setMhxyInventoryTarget,
  updateMhxyAssetFlip,
  updateMhxyGameCoinPurchase,
  updateMhxyInventoryTransfer,
  updateMhxyTrade
} from "../api";
import {
  CommandRail,
  useHomeLayoutPreferences,
  useLiveClock,
  useThemePreference
} from "./dashboard-page";
import { DataSyncControl } from "./data-sync-control";

const localDateTime = () => {
  const date = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000);
  return date.toISOString().slice(0, 16);
};
const toLocalDateTimeInput = (value: string) => {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const money = (value: number | null) =>
  value === null ? "待估值" : `¥${value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const gameCoin = (value: number) => `${value.toLocaleString("zh-CN")} 游戏币`;

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

const emptyAssetFlip = (): MhxyAssetFlipInput => ({
  category: "summon",
  name: "",
  buyAt: localDateTime(),
  purchaseCurrency: "rmb",
  buyPriceRmb: 0,
  gameCoinCost: undefined,
  sellAt: "",
  sellPriceRmb: undefined,
  serverName: "",
  characterName: "",
  note: ""
});

const emptyGameCoinPurchase = (): MhxyGameCoinPurchaseInput => ({
  acquiredAt: localDateTime(),
  gameCoinAmount: 30_000_000,
  rmbCost: 0,
  note: ""
});

export function MhxyPage() {
  const queryClient = useQueryClient();
  const [themeKey, setThemeKey] = useThemePreference();
  const { layout } = useHomeLayoutPreferences();
  const [railExpanded, setRailExpanded] = useState(false);
  const [trade, setTrade] = useState<MhxyTradeInput>(emptyTrade);
  const [editingTradeId, setEditingTradeId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<"ledger" | "assets">("ledger");
  const [assetFlip, setAssetFlip] = useState<MhxyAssetFlipInput>(emptyAssetFlip);
  const [editingAssetFlipId, setEditingAssetFlipId] = useState<string | null>(null);
  const [gameCoinPurchase, setGameCoinPurchase] = useState<MhxyGameCoinPurchaseInput>(emptyGameCoinPurchase);
  const [editingGameCoinPurchaseId, setEditingGameCoinPurchaseId] = useState<string | null>(null);
  const [assetStatusFilter, setAssetStatusFilter] = useState<"all" | MhxyAssetFlipStatus>("all");
  const [assetCategoryFilter, setAssetCategoryFilter] = useState<"all" | MhxyAssetFlipCategory>("all");
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
  const assetFlipMutation = useMutation({
    mutationFn: () =>
      editingAssetFlipId
        ? updateMhxyAssetFlip(editingAssetFlipId, assetFlip)
        : createMhxyAssetFlip(assetFlip),
    onSuccess: () => {
      setAssetFlip(emptyAssetFlip());
      setEditingAssetFlipId(null);
      void refresh();
    }
  });
  const gameCoinPurchaseMutation = useMutation({
    mutationFn: () =>
      editingGameCoinPurchaseId
        ? updateMhxyGameCoinPurchase(editingGameCoinPurchaseId, gameCoinPurchase)
        : createMhxyGameCoinPurchase(gameCoinPurchase),
    onSuccess: () => {
      setGameCoinPurchase(emptyGameCoinPurchase());
      setEditingGameCoinPurchaseId(null);
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
  const deleteMutation = useMutation({
    mutationFn: ({ kind, id }: { kind: "trade" | "snapshot" | "transfer" | "asset" | "coin"; id: string }) => {
      if (kind === "trade") return deleteMhxyTrade(id);
      if (kind === "snapshot") return deleteMhxyPriceSnapshot(id);
      if (kind === "transfer") return deleteMhxyInventoryTransfer(id);
      if (kind === "asset") return deleteMhxyAssetFlip(id);
      return deleteMhxyGameCoinPurchase(id);
    },
    onSuccess: () => void refresh()
  });

  const dashboard = query.data;
  const gameCoinAmount = trade.quantity * trade.unitPrice;
  const convertedRmb = gameCoinAmount * (trade.rmbPerGameCoinWan ?? 0);
  const gameCoinSellFee = trade.type === "sell" ? convertedRmb * 0.05 : 0;
  const filteredAssetFlips = (dashboard?.assetFlips ?? []).filter(
    (item) =>
      (assetStatusFilter === "all" || item.status === assetStatusFilter) &&
      (assetCategoryFilter === "all" || item.category === assetCategoryFilter)
  );
  const estimatedGameCoinRmb = (() => {
    if (assetFlip.purchaseCurrency !== "gameCoin" || !assetFlip.gameCoinCost) return null;
    const editing = (dashboard?.assetFlips ?? []).find((item) => item.id === editingAssetFlipId);
    const assetBuyAt = new Date(assetFlip.buyAt);
    if (Number.isNaN(assetBuyAt.getTime())) return null;
    const assetBuyAtIso = assetBuyAt.toISOString();
    if (
      editing?.purchaseCurrency === "gameCoin" &&
      editing.gameCoinCost === assetFlip.gameCoinCost &&
      editing.buyAt === assetBuyAtIso
    ) {
      return editing.buyPriceRmb;
    }
    const returned = new Map<string, { gameCoinAmount: number; rmbCostCents: number }>();
    for (const allocation of editing?.gameCoinAllocations ?? []) {
      const current = returned.get(allocation.gameCoinPurchaseId) ?? {
        gameCoinAmount: 0,
        rmbCostCents: 0
      };
      returned.set(allocation.gameCoinPurchaseId, {
        gameCoinAmount: current.gameCoinAmount + allocation.gameCoinAmount,
        rmbCostCents: current.rmbCostCents + Math.round(allocation.rmbCost * 100)
      });
    }
    let needed = assetFlip.gameCoinCost;
    let rmbCostCents = 0;
    for (const purchase of [...(dashboard?.gameCoinPurchases ?? [])].sort((a, b) => {
      const acquiredAt = a.acquiredAt.localeCompare(b.acquiredAt);
      if (acquiredAt !== 0) return acquiredAt;
      const createdAt = a.createdAt.localeCompare(b.createdAt);
      return createdAt !== 0 ? createdAt : a.id.localeCompare(b.id);
    })) {
      if (purchase.acquiredAt > assetBuyAtIso || needed === 0) continue;
      const returnedToBatch = returned.get(purchase.id);
      const available = purchase.remainingGameCoinAmount + (returnedToBatch?.gameCoinAmount ?? 0);
      if (available <= 0) continue;
      const used = Math.min(available, needed);
      const availableCents =
        Math.round(purchase.remainingRmbCost * 100) + (returnedToBatch?.rmbCostCents ?? 0);
      rmbCostCents += used === available
        ? availableCents
        : Math.round(availableCents * used / available);
      needed -= used;
    }
    return needed > 0 ? null : rmbCostCents / 100;
  })();
  const previewAssetBuyPrice =
    assetFlip.purchaseCurrency === "gameCoin"
      ? estimatedGameCoinRmb
      : assetFlip.buyPriceRmb ?? 0;
  const previewAssetProfit =
    assetFlip.sellPriceRmb === undefined || previewAssetBuyPrice === null
      ? null
      : assetFlip.sellPriceRmb - previewAssetBuyPrice;
  const error = [
    tradeMutation.error,
    assetFlipMutation.error,
    gameCoinPurchaseMutation.error,
    snapshotMutation.error,
    transferMutation.error,
    targetMutation.error,
    deleteMutation.error,
    query.error
  ]
    .find((item) => item instanceof Error) as Error | undefined;

  function submitTrade(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    tradeMutation.mutate();
  }

  function field(name: keyof MhxyTradeInput, value: string | number) {
    setTrade((current) => ({ ...current, [name]: value }));
  }

  function assetField(name: keyof MhxyAssetFlipInput, value: string | number | undefined) {
    setAssetFlip((current) => ({ ...current, [name]: value }));
  }

  function submitAssetFlip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    assetFlipMutation.mutate();
  }

  function gameCoinPurchaseField(
    name: keyof MhxyGameCoinPurchaseInput,
    value: string | number
  ) {
    setGameCoinPurchase((current) => ({ ...current, [name]: value }));
  }

  function submitGameCoinPurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    gameCoinPurchaseMutation.mutate();
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
          <div className="mhxy-hero__aside">
            <DataSyncControl module="mhxy" onSynced={refresh} />
            <div className="mhxy-summary">
              <span>持有总成本<strong>{money(dashboard?.combinedSummary?.holdingCostRmb ?? dashboard?.summary.inventoryCostRmb ?? 0)}</strong></span>
              <span>已实现总收益<strong>{money(dashboard?.combinedSummary?.realizedProfitRmb ?? dashboard?.summary.realizedProfitRmb ?? 0)}</strong></span>
              <span>主账本市场估值<strong>{money(dashboard?.summary.marketValueRmb ?? 0)}</strong></span>
              <span>主账本未实现浮盈<strong>{money(dashboard?.summary.unrealizedProfitRmb ?? 0)}</strong></span>
            </div>
          </div>
        </header>

        {error ? <p className="mhxy-error">{error.message}</p> : null}

        <div className="mhxy-segment" aria-label="梦幻西游模块切换">
          <button
            type="button"
            className={workspace === "ledger" ? "is-active" : ""}
            onClick={() => setWorkspace("ledger")}
          >
            人民主账本
          </button>
          <button
            type="button"
            className={workspace === "assets" ? "is-active" : ""}
            onClick={() => setWorkspace("assets")}
          >
            召唤兽装备
          </button>
        </div>

        {workspace === "ledger" ? (
          <>
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
              <label>发生时间<input name="occurredAt" type="datetime-local" required value={toLocalDateTimeInput(trade.occurredAt)} onChange={(e) => field("occurredAt", e.target.value)} /></label>
              <label>区服<input name="serverName" value={trade.serverName ?? ""} onChange={(e) => field("serverName", e.target.value)} /></label>
              <label>角色<input name="characterName" value={trade.characterName ?? ""} onChange={(e) => field("characterName", e.target.value)} /></label>
              <label className="mhxy-wide">备注<input name="note" value={trade.note ?? ""} onChange={(e) => field("note", e.target.value)} /></label>
            </div>
            {trade.currency === "gameCoin" ? <div className="mhxy-conversion"><strong>本次交易：{gameCoinAmount} 万游戏币</strong><span>当前比例：1 万 = {trade.rmbPerGameCoinWan ?? 0} 元</span><span>折合人民币：{convertedRmb.toFixed(2)} 元</span>{trade.type === "sell" ? <span>固定手续费：{gameCoinSellFee.toFixed(2)} 元 · 预计实收 {(convertedRmb - gameCoinSellFee).toFixed(2)} 元</span> : null}</div> : null}
            {trade.currency === "gameCoin" ? <p className="mhxy-accounting-note">主账本按这笔交易的成交汇率固定人民币价值，不消耗“召唤兽装备”中的游戏币成本池。</p> : null}
            <button type="submit" disabled={tradeMutation.isPending}>{editingTradeId ? "保存并重新推导" : "记录交易"}</button>
          </form>

          <SnapshotForm currency={snapshotCurrency} setCurrency={setSnapshotCurrency} submit={(input) => snapshotMutation.mutateAsync(input)} pending={snapshotMutation.isPending} />
          <TransferForm
            key={editingTransfer?.id ?? "new-transfer"}
            submit={(input) => transferMutation.mutateAsync(input)}
            editing={editingTransfer}
            pending={transferMutation.isPending}
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
            return <article key={item.id}><div><strong>{item.type === "buy" ? "买入" : "卖出"}｜{item.itemName}｜{item.quantity} 个</strong><p>{item.currency === "gameCoin" ? `${item.gameCoinAmountWan} 万游戏币｜1 万=${item.rmbPerGameCoinWan} 元｜折合 ${money(item.rmbAmount)}` : `人民币 ${money(item.rmbAmount)}`}｜手续费 {money(item.feeRmb)}{result ? `｜已实现收益 ${money(result.realizedProfitRmb)}` : ""}</p></div><div className="mhxy-row-actions"><button type="button" onClick={() => { setEditingTradeId(item.id); setTrade(item); }}>编辑</button><ConfirmDeleteButton pending={deleteMutation.isPending} onConfirm={() => deleteMutation.mutate({ kind: "trade", id: item.id })} /></div></article>;
          })}</div>
        </section>

        <div className="mhxy-grid mhxy-grid--history">
          <section className="mhxy-card">
            <h2>价格快照</h2>
            <div className="mhxy-history">{(dashboard?.priceSnapshots ?? []).map((item) => <article key={item.id}><div><strong>{item.itemName}｜{item.serverName || "未填区服"}</strong><p>{item.currency === "gameCoin" ? `${item.gameCoinUnitPriceWan} 万游戏币｜1 万=${item.rmbPerGameCoinWan} 元` : "人民币价格"}｜人民币单价 {money(item.rmbUnitPrice)}</p></div><ConfirmDeleteButton pending={deleteMutation.isPending} onConfirm={() => deleteMutation.mutate({ kind: "snapshot", id: item.id })} /></article>)}</div>
          </section>
          <section className="mhxy-card">
            <h2>库存转移记录</h2>
            <div className="mhxy-history">{(dashboard?.inventoryTransfers ?? []).map((item) => <article key={item.id}><div><strong>{item.itemName}｜{item.quantity} 个</strong><p>{item.sourceServerName}/{item.sourceCharacterName} → {item.targetServerName}/{item.targetCharacterName}｜转移成本 {money(item.transferCostRmb)}</p></div><div className="mhxy-row-actions"><button type="button" onClick={() => setEditingTransfer(item)}>编辑</button><ConfirmDeleteButton pending={deleteMutation.isPending} onConfirm={() => deleteMutation.mutate({ kind: "transfer", id: item.id })} /></div></article>)}</div>
          </section>
        </div>
          </>
        ) : (
          <section className="mhxy-assets">
            <div className="mhxy-assets__lead">
              <div>
                <p className="eyebrow">ASSET FLIP DESK</p>
                <h2>召唤兽 / 装备人民币盈亏</h2>
                <p>一条记录对应一个具体资产，只看买入价、卖出价和单件赚亏。</p>
              </div>
              <div className="mhxy-asset-metrics">
                <span>在手成本<strong>{money(dashboard?.assetFlipSummary?.holdingCostRmb ?? 0)}</strong></span>
                <span>在手数量<strong>{dashboard?.assetFlipSummary?.holdingCount ?? 0}</strong></span>
                <span>已实现盈亏<strong>{money(dashboard?.assetFlipSummary?.realizedProfitRmb ?? 0)}</strong></span>
                <span>已卖出<strong>{dashboard?.assetFlipSummary?.soldCount ?? 0}</strong></span>
              </div>
            </div>

            <section className="mhxy-coin-wallet">
              <div className="mhxy-coin-wallet__header">
                <div>
                  <p className="eyebrow">GAME COIN COST POOL</p>
                  <h3>游戏币成本池</h3>
                  <p>按购入批次保留真实人民币成本，道具买入默认优先消耗最早的可用批次。</p>
                </div>
                <div className="mhxy-coin-wallet__balance">
                  <span>可用余额<strong>{gameCoin(dashboard?.gameCoinBalance?.gameCoinAmount ?? 0)}</strong></span>
                  <span>剩余成本<strong>{money(dashboard?.gameCoinBalance?.rmbCost ?? 0)}</strong></span>
                </div>
              </div>
              <div className="mhxy-coin-wallet__content">
                <form data-form="game-coin-purchase" onSubmit={submitGameCoinPurchase}>
                  <label>购入时间<input name="acquiredAt" type="datetime-local" required value={toLocalDateTimeInput(gameCoinPurchase.acquiredAt)} onChange={(event) => gameCoinPurchaseField("acquiredAt", event.target.value)} /></label>
                  <label>购入游戏币数量（个）<input name="gameCoinAmount" type="number" min="1" step="1" required value={gameCoinPurchase.gameCoinAmount} onChange={(event) => gameCoinPurchaseField("gameCoinAmount", Number(event.target.value))} /><small>3000 万请输入 30000000。</small></label>
                  <label>实际人民币成本<input name="rmbCost" type="number" min="0.01" step="any" required value={gameCoinPurchase.rmbCost} onChange={(event) => gameCoinPurchaseField("rmbCost", Number(event.target.value))} /></label>
                  <label>备注<input name="note" value={gameCoinPurchase.note ?? ""} onChange={(event) => gameCoinPurchaseField("note", event.target.value)} placeholder="例如：藏宝阁购入" /></label>
                  <button type="submit" disabled={gameCoinPurchaseMutation.isPending}>{editingGameCoinPurchaseId ? "保存批次" : "增加购币批次"}</button>
                  {editingGameCoinPurchaseId ? <button className="mhxy-secondary-button" type="button" onClick={() => { setEditingGameCoinPurchaseId(null); setGameCoinPurchase(emptyGameCoinPurchase()); }}>取消</button> : null}
                </form>
                <div className="mhxy-coin-batches">
                  {(dashboard?.gameCoinPurchases ?? []).map((purchase) => (
                    <article key={purchase.id}>
                      <div>
                        <strong>{gameCoin(purchase.remainingGameCoinAmount)} 可用</strong>
                        <small>原购入 {gameCoin(purchase.gameCoinAmount)} / {money(purchase.rmbCost)}</small>
                        <small>{purchase.acquiredAt.slice(0, 10)} · 剩余人民币成本 {money(purchase.remainingRmbCost)}</small>
                      </div>
                      <div className="mhxy-row-actions"><button type="button" onClick={() => { setEditingGameCoinPurchaseId(purchase.id); setGameCoinPurchase({ acquiredAt: toLocalDateTimeInput(purchase.acquiredAt), gameCoinAmount: purchase.gameCoinAmount, rmbCost: purchase.rmbCost, note: purchase.note ?? "" }); }}>编辑</button><ConfirmDeleteButton pending={deleteMutation.isPending} onConfirm={() => deleteMutation.mutate({ kind: "coin", id: purchase.id })} /></div>
                    </article>
                  ))}
                  {(dashboard?.gameCoinPurchases ?? []).length === 0 ? <p className="mhxy-empty">先登记一次游戏币购入，例如 30,000,000 游戏币花费 ¥230。</p> : null}
                </div>
              </div>
            </section>

            <div className="mhxy-assets__board">
              <section className="mhxy-asset-list" aria-label="召唤兽装备记录">
                <div className="mhxy-asset-toolbar">
                  <div>
                    <h3>资产流水</h3>
                    <p>{filteredAssetFlips.length} 条记录 · 绿色为盈利，红色为亏损</p>
                  </div>
                  <div className="mhxy-filter-strip">
                    <select
                      aria-label="状态筛选"
                      value={assetStatusFilter}
                      onChange={(event) => setAssetStatusFilter(event.target.value as "all" | MhxyAssetFlipStatus)}
                    >
                      <option value="all">全部状态</option>
                      <option value="holding">持有中</option>
                      <option value="sold">已卖出</option>
                    </select>
                    <select
                      aria-label="类型筛选"
                      value={assetCategoryFilter}
                      onChange={(event) => setAssetCategoryFilter(event.target.value as "all" | MhxyAssetFlipCategory)}
                    >
                      <option value="all">全部类型</option>
                      <option value="summon">召唤兽</option>
                      <option value="equipment">装备</option>
                    </select>
                  </div>
                </div>

                <div className="mhxy-asset-table">
                  <div className="mhxy-asset-row mhxy-asset-row--head">
                    <span>资产</span>
                    <span>买入</span>
                    <span>卖出</span>
                    <span>盈亏</span>
                    <span>操作</span>
                  </div>
                  {filteredAssetFlips.map((item) => (
                    <article className="mhxy-asset-row" key={item.id}>
                      <span>
                        <strong>{item.name}</strong>
                        <small>{item.category === "summon" ? "召唤兽" : "装备"} · {item.serverName || "未填区服"} · {item.characterName || "未填角色"}</small>
                      </span>
                      <span>
                        {money(item.buyPriceRmb)}
                        <small>{item.purchaseCurrency === "gameCoin" ? `${gameCoin(item.gameCoinCost ?? 0)} · 批次成本` : "直接人民币"}</small>
                        <small>{item.buyAt.slice(0, 10)}</small>
                      </span>
                      <span>
                        {item.status === "sold" ? money(item.sellPriceRmb ?? 0) : "持有中"}
                        <small>{item.sellAt?.slice(0, 10) ?? "未卖出"}</small>
                      </span>
                      <span className={item.profitRmb === null ? "is-muted" : item.profitRmb >= 0 ? "is-profit" : "is-loss"}>
                        {item.profitRmb === null ? "未实现" : money(item.profitRmb)}
                      </span>
                      <span className="mhxy-row-actions">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingAssetFlipId(item.id);
                            setAssetFlip({
                              ...item,
                              buyAt: toLocalDateTimeInput(item.buyAt),
                              sellAt: item.sellAt ? toLocalDateTimeInput(item.sellAt) : "",
                              sellPriceRmb: item.sellPriceRmb
                            });
                          }}
                        >
                          编辑
                        </button>
                        <ConfirmDeleteButton pending={deleteMutation.isPending} onConfirm={() => deleteMutation.mutate({ kind: "asset", id: item.id })} />
                      </span>
                    </article>
                  ))}
                  {filteredAssetFlips.length === 0 ? (
                    <p className="mhxy-empty">还没有符合筛选条件的召唤兽或装备记录。</p>
                  ) : null}
                </div>
              </section>

              <form className="mhxy-asset-editor" data-form="asset-flip" onSubmit={submitAssetFlip}>
                <div>
                  <p className="eyebrow">{editingAssetFlipId ? "EDIT ASSET" : "NEW ASSET"}</p>
                  <h3>{editingAssetFlipId ? "编辑记录" : "记录买入"}</h3>
                </div>
                <label>类型<select name="category" value={assetFlip.category} onChange={(e) => assetField("category", e.target.value)}><option value="summon">召唤兽</option><option value="equipment">装备</option></select></label>
                <label>名称<input name="name" required value={assetFlip.name} onChange={(e) => assetField("name", e.target.value)} placeholder="例如：须弥画魂 / 160 项链" /></label>
                <label>买入方式<select name="purchaseCurrency" value={assetFlip.purchaseCurrency ?? "rmb"} onChange={(e) => { const currency = e.target.value; setAssetFlip((current) => ({ ...current, purchaseCurrency: currency as "rmb" | "gameCoin", buyPriceRmb: currency === "rmb" ? current.buyPriceRmb ?? 0 : undefined, gameCoinCost: currency === "gameCoin" ? current.gameCoinCost ?? 0 : undefined })); }}><option value="rmb">直接人民币</option><option value="gameCoin">使用游戏币库存</option></select></label>
                <label>买入时间<input name="buyAt" type="datetime-local" required value={toLocalDateTimeInput(assetFlip.buyAt)} onChange={(e) => assetField("buyAt", e.target.value)} /></label>
                {assetFlip.purchaseCurrency === "gameCoin" ? (
                  <label>实际花费游戏币（个）<input name="gameCoinCost" type="number" min="1" step="1" required value={assetFlip.gameCoinCost ?? 0} onChange={(e) => assetField("gameCoinCost", Number(e.target.value))} /><small>这里使用精确数量；666666 就输入 666666。</small></label>
                ) : (
                  <label>买入价格<input name="buyPriceRmb" type="number" min="0" step="any" required value={assetFlip.buyPriceRmb ?? 0} onChange={(e) => assetField("buyPriceRmb", Number(e.target.value))} /></label>
                )}
                <div className="mhxy-asset-sell-fields">
                  <label>卖出时间<input name="sellAt" type="datetime-local" value={assetFlip.sellAt ? toLocalDateTimeInput(assetFlip.sellAt) : ""} onChange={(e) => assetField("sellAt", e.target.value)} /></label>
                  <label>卖出价格<input name="sellPriceRmb" type="number" min="0" step="any" value={assetFlip.sellPriceRmb ?? ""} onChange={(e) => assetField("sellPriceRmb", e.target.value === "" ? undefined : Number(e.target.value))} /></label>
                </div>
                <label>区服<input name="serverName" value={assetFlip.serverName ?? ""} onChange={(e) => assetField("serverName", e.target.value)} /></label>
                <label>角色<input name="characterName" value={assetFlip.characterName ?? ""} onChange={(e) => assetField("characterName", e.target.value)} /></label>
                <label>备注<input name="note" value={assetFlip.note ?? ""} onChange={(e) => assetField("note", e.target.value)} /></label>
                <div className="mhxy-asset-preview">
                  {assetFlip.purchaseCurrency === "gameCoin" ? <strong>{estimatedGameCoinRmb === null ? "游戏币余额不足或缺少可用批次" : `按历史批次折合：${money(estimatedGameCoinRmb)}`}</strong> : null}
                  <span>{previewAssetProfit === null ? "当前状态：持有中" : `预计盈亏：${money(previewAssetProfit)}`}</span>
                  <small>未填写卖出信息时，这条记录会计入在手买入成本。</small>
                </div>
                <button type="submit" disabled={assetFlipMutation.isPending}>{editingAssetFlipId ? "保存记录" : "保存资产"}</button>
                {editingAssetFlipId ? (
                  <button
                    className="mhxy-secondary-button"
                    type="button"
                    onClick={() => {
                      setEditingAssetFlipId(null);
                      setAssetFlip(emptyAssetFlip());
                    }}
                  >
                    取消编辑
                  </button>
                ) : null}
              </form>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

function SnapshotForm({ currency, setCurrency, submit, pending }: { currency: MhxyTradeCurrency; setCurrency: (value: MhxyTradeCurrency) => void; submit: (input: MhxyPriceSnapshotInput) => Promise<unknown>; pending: boolean }) {
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const input = {
      itemName: String(data.get("itemName")),
      serverName: String(data.get("serverName")),
      currency,
      ...(currency === "rmb"
        ? { rmbUnitPrice: Number(data.get("price")) }
        : {
            gameCoinUnitPriceWan: Number(data.get("price")),
            rmbPerGameCoinWan: Number(data.get("rate"))
          }),
      capturedAt: String(data.get("capturedAt"))
    } as MhxyPriceSnapshotInput;
    try {
      await submit(input);
      form.reset();
    } catch {
      // The mutation error is rendered by the parent; preserve the current inputs.
    }
  }

  return <form className="mhxy-card mhxy-form" data-form="price-snapshot" onSubmit={handleSubmit}><h2>记录价格快照</h2><label>币种<select name="currency" value={currency} onChange={(e) => setCurrency(e.target.value as MhxyTradeCurrency)}><option value="rmb">人民币</option><option value="gameCoin">游戏币</option></select></label><label>道具名<input name="itemName" required /></label><label>区服<input name="serverName" required /></label><label>{currency === "rmb" ? "人民币单价" : "游戏币单价（万）"}<input name="price" type="number" min="0" step="any" required /></label>{currency === "gameCoin" ? <label>当时兑换比例（必填）<input name="rate" type="number" min="0.000001" step="any" required /><small>每 1 万游戏币折合多少人民币，用于固定这次商品价值。</small></label> : null}<label>快照时间<input name="capturedAt" type="datetime-local" defaultValue={localDateTime()} required /></label><button type="submit" disabled={pending}>保存快照</button></form>;
}

function TransferForm({ submit, editing, pending }: { submit: (input: MhxyInventoryTransferInput) => Promise<unknown>; editing: MhxyInventoryTransferRecord | null; pending: boolean }) {
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await submit({ itemName: String(data.get("itemName")), quantity: Number(data.get("quantity")), sourceServerName: String(data.get("sourceServerName")), sourceCharacterName: String(data.get("sourceCharacterName")), targetServerName: String(data.get("targetServerName")), targetCharacterName: String(data.get("targetCharacterName")), transferCostRmb: Number(data.get("transferCostRmb")), occurredAt: String(data.get("occurredAt")) });
      if (!editing) form.reset();
    } catch {
      // The mutation error is rendered by the parent; preserve the current inputs.
    }
  }

  return <form className="mhxy-card mhxy-form" onSubmit={handleSubmit}><h2>{editing ? "编辑库存转移" : "跨服库存转移"}</h2><label>道具名<input name="itemName" defaultValue={editing?.itemName} required /></label><label>数量<input name="quantity" type="number" min="1" step="1" defaultValue={editing?.quantity} required /></label><label>源区服<input name="sourceServerName" defaultValue={editing?.sourceServerName} required /></label><label>源角色<input name="sourceCharacterName" defaultValue={editing?.sourceCharacterName} required /></label><label>目标区服<input name="targetServerName" defaultValue={editing?.targetServerName} required /></label><label>目标角色<input name="targetCharacterName" defaultValue={editing?.targetCharacterName} required /></label><label>人民币转移成本<input name="transferCostRmb" type="number" min="0" step="any" defaultValue={editing?.transferCostRmb} required /></label><label>发生时间<input name="occurredAt" type="datetime-local" defaultValue={editing ? toLocalDateTimeInput(editing.occurredAt) : localDateTime()} required /></label><button type="submit" disabled={pending}>{editing ? "保存并重新推导" : "保存转移"}</button></form>;
}

function ConfirmDeleteButton({ onConfirm, pending }: { onConfirm: () => void; pending: boolean }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) return <button className="mhxy-delete-button" type="button" onClick={() => setConfirming(true)}>删除</button>;
  return <span className="mhxy-confirm-delete"><button type="button" disabled={pending} onClick={onConfirm}>确认</button><button type="button" onClick={() => setConfirming(false)}>取消</button></span>;
}
