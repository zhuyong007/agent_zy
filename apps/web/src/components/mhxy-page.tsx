import type { FormEvent } from "react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  MhxyAssetFlipCategory,
  MhxyAssetFlipInput,
  MhxyInventoryTransferInput,
  MhxyInventoryTransferRecord,
  MhxyPriceSnapshot,
  MhxyPriceSnapshotInput,
  MhxyTradeCurrency,
  MhxyTradeInput
} from "@agent-zy/shared-types";

import {
  createMhxyAssetFlip,
  createMhxyInventoryTransfer,
  createMhxyPriceSnapshot,
  createMhxyTrade,
  deleteMhxyAssetFlip,
  deleteMhxyInventoryTransfer,
  deleteMhxyPriceSnapshot,
  deleteMhxyTrade,
  fetchMhxyDashboard,
  setMhxyInventoryTarget,
  updateMhxyAssetFlip,
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

const assetFlipCategoryLabels: Record<MhxyAssetFlipCategory, string> = {
  role: "角色",
  summon: "召唤兽",
  equipment: "装备"
};

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

export function MhxyPage() {
  const queryClient = useQueryClient();
  const [themeKey, setThemeKey] = useThemePreference();
  const { layout } = useHomeLayoutPreferences();
  const [railExpanded, setRailExpanded] = useState(false);
  const [trade, setTrade] = useState<MhxyTradeInput>(emptyTrade);
  const [editingTradeId, setEditingTradeId] = useState<string | null>(null);
  const [tradeFormOpen, setTradeFormOpen] = useState(false);
  const [workspace, setWorkspace] = useState<"crossServer" | "roleAssets" | "prices">("crossServer");
  const [assetFlip, setAssetFlip] = useState<MhxyAssetFlipInput>(emptyAssetFlip);
  const [editingAssetFlipId, setEditingAssetFlipId] = useState<string | null>(null);
  const [assetFormOpen, setAssetFormOpen] = useState(false);
  const [snapshotCurrency, setSnapshotCurrency] = useState<MhxyTradeCurrency>("rmb");
  const [editingTransfer, setEditingTransfer] = useState<MhxyInventoryTransferRecord | null>(null);
  const [transferFormOpen, setTransferFormOpen] = useState(false);
  const query = useQuery({ queryKey: ["mhxy"], queryFn: fetchMhxyDashboard });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["mhxy"] });
  const tradeMutation = useMutation({
    mutationFn: () => editingTradeId ? updateMhxyTrade(editingTradeId, trade) : createMhxyTrade(trade),
    onSuccess: () => {
      setTrade(emptyTrade());
      setEditingTradeId(null);
      setTradeFormOpen(false);
      void refresh();
    }
  });
  const assetFlipMutation = useMutation({
    mutationFn: (input: MhxyAssetFlipInput) =>
      editingAssetFlipId
        ? updateMhxyAssetFlip(editingAssetFlipId, input)
        : createMhxyAssetFlip(input),
    onSuccess: () => {
      setAssetFlip(emptyAssetFlip());
      setEditingAssetFlipId(null);
      setAssetFormOpen(false);
      void refresh();
    }
  });
  const snapshotMutation = useMutation({
    mutationFn: (input: MhxyPriceSnapshotInput) => createMhxyPriceSnapshot(input),
    onSuccess: () => void refresh()
  });
  const transferMutation = useMutation({
    mutationFn: (input: MhxyInventoryTransferInput) =>
      editingTransfer ? updateMhxyInventoryTransfer(editingTransfer.id, input) : createMhxyInventoryTransfer(input),
    onSuccess: () => {
      setEditingTransfer(null);
      setTransferFormOpen(false);
      void refresh();
    }
  });
  const targetMutation = useMutation({
    mutationFn: setMhxyInventoryTarget,
    onSuccess: () => void refresh()
  });
  const deleteMutation = useMutation({
    mutationFn: ({ kind, id }: { kind: "trade" | "snapshot" | "transfer" | "asset"; id: string }) => {
      if (kind === "trade") return deleteMhxyTrade(id);
      if (kind === "snapshot") return deleteMhxyPriceSnapshot(id);
      if (kind === "transfer") return deleteMhxyInventoryTransfer(id);
      return deleteMhxyAssetFlip(id);
    },
    onSuccess: () => void refresh()
  });

  const dashboard = query.data;
  const gameCoinAmount = trade.quantity * trade.unitPrice;
  const convertedRmb = gameCoinAmount * (trade.rmbPerGameCoinWan ?? 0);
  const gameCoinSellFee = trade.type === "sell" ? convertedRmb * 0.05 : 0;
  const holdingAssetFlips = (dashboard?.assetFlips ?? []).filter((item) => item.status === "holding");
  const soldAssetFlips = (dashboard?.assetFlips ?? []).filter((item) => item.status === "sold");
  const previewAssetBuyPrice = assetFlip.buyPriceRmb ?? 0;
  const previewAssetProfit =
    assetFlip.sellPriceRmb === undefined
      ? null
      : assetFlip.sellPriceRmb - previewAssetBuyPrice;
  const error = [
    tradeMutation.error,
    assetFlipMutation.error,
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

  function setAssetCategory(category: MhxyAssetFlipCategory) {
    setAssetFlip((current) => ({
      ...current,
      category,
      characterName: category === "role" ? undefined : current.characterName
    }));
  }

  function submitAssetFlip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    assetFlipMutation.mutate(
      assetFlip.category === "role"
        ? { ...assetFlip, characterName: undefined }
        : assetFlip
    );
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
            className={workspace === "crossServer" ? "is-active" : ""}
            onClick={() => setWorkspace("crossServer")}
          >
            跨服交易记录
          </button>
          <button
            type="button"
            className={workspace === "roleAssets" ? "is-active" : ""}
            onClick={() => setWorkspace("roleAssets")}
          >
            资产交易记录
          </button>
          <button
            type="button"
            className={workspace === "prices" ? "is-active" : ""}
            onClick={() => setWorkspace("prices")}
          >
            物价记录
          </button>
        </div>

        {workspace === "crossServer" ? (
          <section className="mhxy-cross-server" data-cross-server-workspace>
            <header className="mhxy-cross-server__header">
              <div>
                <p className="mhxy-ledger-eyebrow">SERVER ROUTE DESK · 区服调度</p>
                <h2>跨服库存调度台</h2>
                <p>先看持仓和去向，需要时再补一笔交易或转移。</p>
              </div>
              <div className="mhxy-cross-server__actions">
                <details className="mhxy-cross-action" open={tradeFormOpen} onToggle={(event) => setTradeFormOpen(event.currentTarget.open)}>
                  <summary>＋ 记录交易</summary>
                  <form className="mhxy-form mhxy-cross-form" data-form="trade" onSubmit={submitTrade}>
                    <div><p className="eyebrow">TRADE ENTRY</p><h3>{editingTradeId ? "编辑交易" : "记录买入 / 卖出"}</h3></div>
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
                    {trade.currency === "gameCoin" ? <p className="mhxy-accounting-note">跨服交易按这笔交易的成交汇率固定人民币价值。</p> : null}
                    <button type="submit" disabled={tradeMutation.isPending}>{editingTradeId ? "保存并重新推导" : "记录交易"}</button>
                  </form>
                </details>
                <details className="mhxy-cross-action" open={transferFormOpen} onToggle={(event) => setTransferFormOpen(event.currentTarget.open)}>
                  <summary>⇄ 库存转移</summary>
                  <TransferForm key={editingTransfer?.id ?? "new-transfer"} submit={(input) => transferMutation.mutateAsync(input)} editing={editingTransfer} pending={transferMutation.isPending} />
                </details>
              </div>
            </header>

            <div className="mhxy-ledger-metrics">
              <span>库存成本<strong>{money(dashboard?.summary.inventoryCostRmb ?? 0)}</strong></span>
              <span>市场估值<strong>{money(dashboard?.summary.marketValueRmb ?? 0)}</strong></span>
              <span>未实现浮盈<strong>{money(dashboard?.summary.unrealizedProfitRmb ?? 0)}</strong></span>
              <span>已实现收益<strong>{money(dashboard?.summary.realizedProfitRmb ?? 0)}</strong></span>
            </div>

            <section className="mhxy-cross-inventory" data-cross-inventory>
              <div className="mhxy-ledger-section-heading"><div><h3>当前库存</h3><p>成本、估值与下一站放在同一条路线上。</p></div><span>{dashboard?.inventory.length ?? 0} 项持仓</span></div>
              <div className="mhxy-table">
                <div className="mhxy-row mhxy-row--head"><span>道具</span><span>当前区</span><span>目标区</span><span>数量</span><span>人民币成本</span><span>市场估值</span></div>
                {(dashboard?.inventory ?? []).map((item) => <div className="mhxy-row" key={`${item.itemName}-${item.serverName}-${item.characterName}`}><span><strong>{item.itemName}</strong><small>{item.characterName || "未填角色"}</small></span><span><strong>{item.serverName || "未填区服"}</strong></span><span className="mhxy-route-target"><input aria-label={`${item.itemName}目标区`} defaultValue={item.expectedSellServerName} placeholder="填写目标区服" onBlur={(e) => targetMutation.mutate({ itemName: item.itemName, serverName: item.serverName, characterName: item.characterName, expectedSellServerName: e.target.value })} /></span><span>{item.quantity}</span><span>{money(item.inventoryCostRmb)}<small>均价 {money(item.averageUnitCostRmb)}</small></span><span>{money(item.marketValueRmb)}<small>{item.latestRmbUnitPrice === null ? "物价记录中暂无同名道具" : `单价 ${money(item.latestRmbUnitPrice)} · ${item.valuationSourceName || "未标注来源"}`}</small><small>浮盈 {money(item.unrealizedProfitRmb)}</small></span></div>)}
                {(dashboard?.inventory ?? []).length === 0 ? <p className="mhxy-ledger-empty">还没有跨服持仓。使用“记录交易”添加第一笔买入。</p> : null}
              </div>
            </section>

            <div className="mhxy-cross-streams">
              <section data-cross-trades>
                <div className="mhxy-ledger-section-heading"><div><h3>交易流水</h3><p>买入、卖出及已实现收益。</p></div><span>{dashboard?.trades.length ?? 0} 笔</span></div>
                <div className="mhxy-history">{(dashboard?.trades ?? []).map((item) => {
                  const result = dashboard?.tradeResults.find((entry) => entry.tradeId === item.id);
                  return <article key={item.id}><div><strong>{item.type === "buy" ? "买入" : "卖出"}｜{item.itemName}｜{item.quantity} 个</strong><p>{item.currency === "gameCoin" ? `${item.gameCoinAmountWan} 万游戏币｜1 万=${item.rmbPerGameCoinWan} 元｜折合 ${money(item.rmbAmount)}` : `人民币 ${money(item.rmbAmount)}`}｜手续费 {money(item.feeRmb)}{result ? `｜已实现收益 ${money(result.realizedProfitRmb)}` : ""}</p></div><div className="mhxy-row-actions"><button type="button" onClick={() => { setEditingTradeId(item.id); setTrade(item); setTradeFormOpen(true); }}>编辑</button><ConfirmDeleteButton pending={deleteMutation.isPending} onConfirm={() => deleteMutation.mutate({ kind: "trade", id: item.id })} /></div></article>;
                })}{(dashboard?.trades ?? []).length === 0 ? <p className="mhxy-ledger-empty">暂无交易流水。</p> : null}</div>
              </section>
              <section data-cross-transfers>
                <div className="mhxy-ledger-section-heading"><div><h3>转移轨迹</h3><p>角色与区服之间的库存路线。</p></div><span>{dashboard?.inventoryTransfers.length ?? 0} 笔</span></div>
                <div className="mhxy-history">{(dashboard?.inventoryTransfers ?? []).map((item) => <article key={item.id}><div><strong>{item.itemName}｜{item.quantity} 个</strong><p>{item.sourceServerName}/{item.sourceCharacterName} → {item.targetServerName}/{item.targetCharacterName}｜转移成本 {money(item.transferCostRmb)}</p></div><div className="mhxy-row-actions"><button type="button" onClick={() => { setEditingTransfer(item); setTransferFormOpen(true); }}>编辑</button><ConfirmDeleteButton pending={deleteMutation.isPending} onConfirm={() => deleteMutation.mutate({ kind: "transfer", id: item.id })} /></div></article>)}{(dashboard?.inventoryTransfers ?? []).length === 0 ? <p className="mhxy-ledger-empty">暂无库存转移。</p> : null}</div>
              </section>
            </div>
          </section>
        ) : null}

        {workspace === "prices" ? (
          <PriceTrendWorkspace
            snapshots={dashboard?.priceSnapshots ?? []}
            currency={snapshotCurrency}
            setCurrency={setSnapshotCurrency}
            submit={(input) => snapshotMutation.mutateAsync(input)}
            pending={snapshotMutation.isPending}
            deletePending={deleteMutation.isPending}
            onDelete={(id) => deleteMutation.mutate({ kind: "snapshot", id })}
          />
        ) : null}

        {workspace === "roleAssets" ? (
          <section className="mhxy-assets" data-role-assets-workspace>
            <div className="mhxy-assets__lead">
              <div className="mhxy-assets__identity">
                <div>
                  <p className="mhxy-ledger-eyebrow">ROLE ASSET FOLIO · 角色资产簿</p>
                  <h2>角色 / 召唤兽 / 装备人民币盈亏</h2>
                  <p>持有与已售分开看，只保留人民币成本和盈亏。</p>
                </div>
                <details className="mhxy-asset-add" open={assetFormOpen} onToggle={(event) => setAssetFormOpen(event.currentTarget.open)}>
                  <summary>{editingAssetFlipId ? "编辑资产" : "＋ 添加资产"}</summary>
                  <form className="mhxy-asset-editor" data-form="asset-flip" onSubmit={submitAssetFlip}>
                    <div><p className="eyebrow">{editingAssetFlipId ? "EDIT ASSET" : "NEW ASSET"}</p><h3>{editingAssetFlipId ? "编辑记录" : "记录买入"}</h3></div>
                    <label>类型<select name="category" value={assetFlip.category} onChange={(e) => setAssetCategory(e.target.value as MhxyAssetFlipCategory)}><option value="role">角色</option><option value="summon">召唤兽</option><option value="equipment">装备</option></select></label>
                    <label>名称<input name="name" required value={assetFlip.name} onChange={(e) => assetField("name", e.target.value)} placeholder="例如：须弥画魂 / 160 项链" /></label>
                    <label>买入时间<input name="buyAt" type="datetime-local" required value={toLocalDateTimeInput(assetFlip.buyAt)} onChange={(e) => assetField("buyAt", e.target.value)} /></label>
                    <label>人民币买入价格<input name="buyPriceRmb" type="number" min="0" step="any" required value={assetFlip.buyPriceRmb ?? 0} onChange={(e) => assetField("buyPriceRmb", Number(e.target.value))} /></label>
                    <div className="mhxy-asset-sell-fields">
                      <label>卖出时间<input name="sellAt" type="datetime-local" value={assetFlip.sellAt ? toLocalDateTimeInput(assetFlip.sellAt) : ""} onChange={(e) => assetField("sellAt", e.target.value)} /></label>
                      <label>卖出价格<input name="sellPriceRmb" type="number" min="0" step="any" value={assetFlip.sellPriceRmb ?? ""} onChange={(e) => assetField("sellPriceRmb", e.target.value === "" ? undefined : Number(e.target.value))} /></label>
                    </div>
                    <label>区服<input name="serverName" value={assetFlip.serverName ?? ""} onChange={(e) => assetField("serverName", e.target.value)} /></label>
                    {assetFlip.category === "role" ? null : <label>归属角色<input name="characterName" value={assetFlip.characterName ?? ""} onChange={(e) => assetField("characterName", e.target.value)} /></label>}
                    <label>备注<input name="note" value={assetFlip.note ?? ""} onChange={(e) => assetField("note", e.target.value)} /></label>
                    <div className="mhxy-asset-preview"><span>{previewAssetProfit === null ? "当前状态：持有中" : `预计盈亏：${money(previewAssetProfit)}`}</span><small>未填写卖出信息时，这条记录会按人民币买入成本计入库存价值。</small></div>
                    <button type="submit" disabled={assetFlipMutation.isPending}>{editingAssetFlipId ? "保存记录" : "保存资产"}</button>
                    {editingAssetFlipId ? <button className="mhxy-secondary-button" type="button" onClick={() => { setEditingAssetFlipId(null); setAssetFlip(emptyAssetFlip()); setAssetFormOpen(false); }}>取消编辑</button> : null}
                  </form>
                </details>
              </div>
              <div className="mhxy-asset-metrics">
                <span>库存价值<strong>{money(dashboard?.assetFlipSummary?.holdingCostRmb ?? 0)}</strong></span>
                <span>当前库存<strong>{dashboard?.assetFlipSummary?.holdingCount ?? 0}</strong></span>
                <span>总盈亏<strong>{money(dashboard?.assetFlipSummary?.realizedProfitRmb ?? 0)}</strong></span>
                <span>已卖出<strong>{dashboard?.assetFlipSummary?.soldCount ?? 0}</strong></span>
              </div>
            </div>

            <div className="mhxy-assets__board">
              <section className="mhxy-asset-list" aria-label="资产记录">
                <section aria-label="资产当前库存">
                  <div className="mhxy-asset-toolbar">
                    <div>
                      <h3>当前库存</h3>
                      <p>{holdingAssetFlips.length} 件持有资产 · 库存价值按人民币买入成本计算</p>
                    </div>
                  </div>
                  <div className="mhxy-asset-table">
                    <div className="mhxy-asset-row mhxy-asset-row--head">
                      <span>资产</span><span>买入成本</span><span>状态</span><span>盈亏</span><span>操作</span>
                    </div>
                    {holdingAssetFlips.map((item) => (
                      <article className="mhxy-asset-row" key={item.id}>
                        <span><strong>{item.name}</strong><small>{assetFlipCategoryLabels[item.category]} · {item.serverName || "未填区服"}{item.category === "role" ? null : <> · {item.characterName || "未填归属角色"}</>}</small></span>
                        <span>{money(item.buyPriceRmb)}<small>{item.buyAt.slice(0, 10)}</small></span>
                        <span>持有中<small>计入库存价值</small></span>
                        <span className="is-muted">不计算浮盈</span>
                        <span className="mhxy-row-actions">
                          <button type="button" onClick={() => { setEditingAssetFlipId(item.id); setAssetFlip({ ...item, purchaseCurrency: "rmb", gameCoinCost: undefined, buyAt: toLocalDateTimeInput(item.buyAt), sellAt: item.sellAt ? toLocalDateTimeInput(item.sellAt) : "", sellPriceRmb: item.sellPriceRmb }); setAssetFormOpen(true); }}>编辑</button>
                          <ConfirmDeleteButton pending={deleteMutation.isPending} onConfirm={() => deleteMutation.mutate({ kind: "asset", id: item.id })} />
                        </span>
                      </article>
                    ))}
                    {holdingAssetFlips.length === 0 ? <p className="mhxy-empty">当前没有持有中的资产。</p> : null}
                  </div>
                </section>

                <section aria-label="资产交易历史">
                  <div className="mhxy-asset-toolbar">
                    <div>
                      <h3>交易历史</h3>
                      <p>{soldAssetFlips.length} 条已售记录 · 盈亏为人民币卖出价减买入价</p>
                    </div>
                  </div>
                  <div className="mhxy-asset-table">
                    <div className="mhxy-asset-row mhxy-asset-row--head">
                      <span>资产</span><span>买入</span><span>卖出</span><span>盈亏</span><span>操作</span>
                    </div>
                    {soldAssetFlips.map((item) => (
                      <article className="mhxy-asset-row" key={item.id}>
                        <span><strong>{item.name}</strong><small>{assetFlipCategoryLabels[item.category]} · {item.serverName || "未填区服"}{item.category === "role" ? null : <> · {item.characterName || "未填归属角色"}</>}</small></span>
                        <span>{money(item.buyPriceRmb)}<small>{item.buyAt.slice(0, 10)}</small></span>
                        <span>{money(item.sellPriceRmb ?? 0)}<small>{item.sellAt?.slice(0, 10)}</small></span>
                        <span className={(item.profitRmb ?? 0) >= 0 ? "is-profit" : "is-loss"}>{money(item.profitRmb ?? 0)}</span>
                        <span className="mhxy-row-actions">
                          <button type="button" onClick={() => { setEditingAssetFlipId(item.id); setAssetFlip({ ...item, purchaseCurrency: "rmb", gameCoinCost: undefined, buyAt: toLocalDateTimeInput(item.buyAt), sellAt: item.sellAt ? toLocalDateTimeInput(item.sellAt) : "", sellPriceRmb: item.sellPriceRmb }); setAssetFormOpen(true); }}>编辑</button>
                          <ConfirmDeleteButton pending={deleteMutation.isPending} onConfirm={() => deleteMutation.mutate({ kind: "asset", id: item.id })} />
                        </span>
                      </article>
                    ))}
                    {soldAssetFlips.length === 0 ? <p className="mhxy-empty">还没有已售出的资产记录。</p> : null}
                  </div>
                </section>
              </section>


            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}

interface PriceSeries {
  key: string;
  itemName: string;
  sourceName: string;
  records: MhxyPriceSnapshot[];
}

function signedMoney(value: number) {
  const prefix = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${prefix}¥${Math.abs(value).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function PriceTrendWorkspace({
  snapshots,
  currency,
  setCurrency,
  submit,
  pending,
  deletePending,
  onDelete
}: {
  snapshots: MhxyPriceSnapshot[];
  currency: MhxyTradeCurrency;
  setCurrency: (value: MhxyTradeCurrency) => void;
  submit: (input: MhxyPriceSnapshotInput) => Promise<unknown>;
  pending: boolean;
  deletePending: boolean;
  onDelete: (id: string) => void;
}) {
  const [selectedKey, setSelectedKey] = useState("");
  const [quickFormOpen, setQuickFormOpen] = useState(false);
  const seriesMap = new Map<string, PriceSeries>();
  for (const snapshot of snapshots) {
    const sourceName = snapshot.serverName || "未分类来源";
    const key = `${sourceName}\u0000${snapshot.itemName}`;
    const current = seriesMap.get(key) ?? {
      key,
      itemName: snapshot.itemName,
      sourceName,
      records: []
    };
    current.records.push(snapshot);
    seriesMap.set(key, current);
  }
  const series = [...seriesMap.values()].map((item) => ({
    ...item,
    records: [...item.records].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))
  }));
  const activeSeries = series.find((item) => item.key === selectedKey) ?? series[0] ?? null;

  if (!activeSeries) {
    return (
      <section className="mhxy-market mhxy-market--empty">
        <div>
          <p className="mhxy-market__eyebrow">PRICE THREAD</p>
          <h2>还没有可观察的价格走势</h2>
          <p>添加同一道具在不同日期的价格后，这里会自动生成趋势。</p>
        </div>
        <details className="mhxy-price-add">
          <summary>添加记录</summary>
          <SnapshotForm currency={currency} setCurrency={setCurrency} submit={submit} pending={pending} />
        </details>
      </section>
    );
  }

  const first = activeSeries.records[0];
  const latest = activeSeries.records[activeSeries.records.length - 1];
  const difference = latest.rmbUnitPrice - first.rmbUnitPrice;
  const percentage = first.rmbUnitPrice === 0 ? 0 : difference / first.rmbUnitPrice * 100;
  const prices = activeSeries.records.map((item) => item.rmbUnitPrice);
  const lowest = Math.min(...prices);
  const highest = Math.max(...prices);
  const direction = difference > 0 ? "is-up" : difference < 0 ? "is-down" : "is-flat";

  const plot = { left: 58, right: 738, top: 38, bottom: 238 };
  const spread = highest - lowest;
  const padding = spread === 0 ? Math.max(highest * 0.08, 1) : spread * 0.18;
  const chartMin = lowest - padding;
  const chartMax = highest + padding;
  const chartRange = chartMax - chartMin || 1;
  const points = activeSeries.records.map((item, index) => ({
    item,
    x: activeSeries.records.length === 1
      ? (plot.left + plot.right) / 2
      : plot.left + (plot.right - plot.left) * index / (activeSeries.records.length - 1),
    y: plot.bottom - (item.rmbUnitPrice - chartMin) / chartRange * (plot.bottom - plot.top)
  }));
  const pointString = points.map((point) => `${point.x},${point.y}`).join(" ");
  const areaPath = points.length
    ? `M ${points[0].x} ${plot.bottom} L ${pointString.replaceAll(",", " ").replaceAll(" ", " ")} L ${points[points.length - 1].x} ${plot.bottom} Z`
    : "";

  return (
    <section className="mhxy-market">
      <header className="mhxy-market__header">
        <div>
          <p className="mhxy-market__eyebrow">PRICE THREAD · 行情丝线</p>
          <h2>道具价格观察台</h2>
          <p>选一个道具，只看它自己的历史价格。</p>
        </div>
        <details className="mhxy-price-add">
          <summary>＋ 添加记录</summary>
          <SnapshotForm currency={currency} setCurrency={setCurrency} submit={submit} pending={pending} />
        </details>
      </header>

      <div className="mhxy-market__layout">
        <aside className="mhxy-market-watchlist" aria-label="选择观察道具">
          <div className="mhxy-market-watchlist__title">
            <span>观察列表</span>
            <small>{series.length} 个道具</small>
          </div>
          <div className="mhxy-market-watchlist__items">
            {series.map((item) => {
              const itemFirst = item.records[0];
              const itemLatest = item.records[item.records.length - 1];
              const itemDifference = itemLatest.rmbUnitPrice - itemFirst.rmbUnitPrice;
              const itemPercentage = itemFirst.rmbUnitPrice === 0 ? 0 : itemDifference / itemFirst.rmbUnitPrice * 100;
              return (
                <button
                  type="button"
                  data-price-item={item.key}
                  className={item.key === activeSeries.key ? "is-active" : ""}
                  onClick={() => {
                    setSelectedKey(item.key);
                    setQuickFormOpen(false);
                  }}
                  key={item.key}
                >
                  <span><strong>{item.itemName}</strong><small>{item.sourceName}</small></span>
                  <span className="mhxy-market-watchlist__price"><strong>{money(itemLatest.rmbUnitPrice)}</strong><small className={itemDifference > 0 ? "is-up" : itemDifference < 0 ? "is-down" : "is-flat"}>{item.records.length} 期 · {itemPercentage > 0 ? "+" : ""}{itemPercentage.toFixed(1)}%</small></span>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="mhxy-market__main">
          <section className="mhxy-price-trend" data-price-trend>
            <div className="mhxy-price-trend__heading">
              <div className="mhxy-price-trend__identity">
                <div>
                  <span>{activeSeries.sourceName}</span>
                  <h3>{activeSeries.itemName}</h3>
                  <small>最新采集于 {latest.capturedAt.slice(0, 10)}</small>
                </div>
                <details
                  className="mhxy-price-quick-add"
                  open={quickFormOpen}
                  onToggle={(event) => setQuickFormOpen(event.currentTarget.open)}
                >
                  <summary>＋ 记录新价格</summary>
                  <QuickSnapshotForm
                    key={activeSeries.key}
                    itemName={activeSeries.itemName}
                    sourceName={activeSeries.sourceName}
                    submit={submit}
                    pending={pending}
                    onSaved={() => setQuickFormOpen(false)}
                  />
                </details>
              </div>
              <div className="mhxy-price-trend__latest">
                <span>最新价</span>
                <strong>{money(latest.rmbUnitPrice)}</strong>
                <small className={direction}>{signedMoney(difference)} · {percentage > 0 ? "+" : ""}{percentage.toFixed(1)}%</small>
              </div>
            </div>

            <div className="mhxy-price-trend__metrics">
              <span>首期<strong>{money(first.rmbUnitPrice)}</strong></span>
              <span>区间最低<strong>{money(lowest)}</strong></span>
              <span>区间最高<strong>{money(highest)}</strong></span>
              <span>样本数量<strong>{activeSeries.records.length} 期</strong></span>
            </div>

            <div className="mhxy-price-chart">
              <svg viewBox="0 0 800 286" role="img" aria-label={`${activeSeries.itemName}价格走势`}>
                <defs>
                  <linearGradient id="mhxy-price-area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#42D6B0" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="#42D6B0" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {[0, 1, 2, 3].map((tick) => {
                  const y = plot.top + (plot.bottom - plot.top) * tick / 3;
                  const value = chartMax - chartRange * tick / 3;
                  return <g key={tick}><line className="mhxy-price-chart__grid" x1={plot.left} x2={plot.right} y1={y} y2={y} /><text className="mhxy-price-chart__axis" x="8" y={y + 4}>{Math.round(value)}</text></g>;
                })}
                {areaPath ? <path className="mhxy-price-chart__area" d={areaPath} /> : null}
                <polyline className="mhxy-price-chart__line" points={pointString} />
                {points.map((point, index) => (
                  <g className="mhxy-price-chart__point" key={point.item.id}>
                    <circle cx={point.x} cy={point.y} r="5" />
                    <text className="mhxy-price-chart__value" x={point.x} y={point.y - 14} textAnchor="middle">¥{point.item.rmbUnitPrice}</text>
                    <text className="mhxy-price-chart__date" x={point.x} y="268" textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}>{point.item.capturedAt.slice(5, 10)}</text>
                  </g>
                ))}
              </svg>
            </div>
          </section>

          <section className="mhxy-price-history" data-price-history>
            <div className="mhxy-price-history__heading"><h3>价格明细</h3><span>按采集时间排列</span></div>
            <div className="mhxy-price-history__rows">
              {activeSeries.records.map((item, index) => {
                const previous = activeSeries.records[index - 1];
                const change = previous ? item.rmbUnitPrice - previous.rmbUnitPrice : null;
                return (
                  <article key={item.id}>
                    <time dateTime={item.capturedAt}>{item.capturedAt.slice(0, 10)}</time>
                    <strong>{money(item.rmbUnitPrice)}</strong>
                    <span className={change === null ? "is-flat" : change > 0 ? "is-up" : change < 0 ? "is-down" : "is-flat"}>{change === null ? "首期基准" : `${signedMoney(change)} 较上期`}</span>
                    <ConfirmDeleteButton pending={deletePending} onConfirm={() => onDelete(item.id)} />
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}

function QuickSnapshotForm({
  itemName,
  sourceName,
  submit,
  pending,
  onSaved
}: {
  itemName: string;
  sourceName: string;
  submit: (input: MhxyPriceSnapshotInput) => Promise<unknown>;
  pending: boolean;
  onSaved: () => void;
}) {
  const [currency, setCurrency] = useState<MhxyTradeCurrency>("rmb");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const input = {
      itemName,
      serverName: sourceName,
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
      setCurrency("rmb");
      onSaved();
    } catch {
      // The mutation error is rendered by the parent; preserve the current inputs.
    }
  }

  return <form className="mhxy-form mhxy-price-form" data-form="quick-price-snapshot" onSubmit={handleSubmit}><div><p className="eyebrow">QUICK SNAPSHOT</p><h3>记录新价格</h3><p>{itemName} · {sourceName}</p></div><label>币种<select name="currency" value={currency} onChange={(event) => setCurrency(event.target.value as MhxyTradeCurrency)}><option value="rmb">人民币</option><option value="gameCoin">游戏币</option></select></label><label>{currency === "rmb" ? "人民币单价" : "游戏币单价（万）"}<input name="price" type="number" min="0" step="any" required /></label>{currency === "gameCoin" ? <label>当时兑换比例（必填）<input name="rate" type="number" min="0.000001" step="any" required /><small>每 1 万游戏币折合多少人民币，用于固定这次商品价值。</small></label> : null}<label>采集时间<input name="capturedAt" type="datetime-local" defaultValue={localDateTime()} required /></label><button type="submit" disabled={pending}>保存新价格</button></form>;
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

  return <form className="mhxy-form mhxy-price-form" data-form="price-snapshot" onSubmit={handleSubmit}><div><p className="eyebrow">NEW SNAPSHOT</p><h3>添加价格记录</h3></div><label>币种<select name="currency" value={currency} onChange={(e) => setCurrency(e.target.value as MhxyTradeCurrency)}><option value="rmb">人民币</option><option value="gameCoin">游戏币</option></select></label><label>道具名<input name="itemName" required /></label><label>来源 / 区服<input name="serverName" required placeholder="例如：藏宝阁（兽决）" /></label><label>{currency === "rmb" ? "人民币单价" : "游戏币单价（万）"}<input name="price" type="number" min="0" step="any" required /></label>{currency === "gameCoin" ? <label>当时兑换比例（必填）<input name="rate" type="number" min="0.000001" step="any" required /><small>每 1 万游戏币折合多少人民币，用于固定这次商品价值。</small></label> : null}<label>采集时间<input name="capturedAt" type="datetime-local" defaultValue={localDateTime()} required /></label><button type="submit" disabled={pending}>保存记录</button></form>;
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

  return <form className="mhxy-form mhxy-cross-form" data-form="inventory-transfer" onSubmit={handleSubmit}><div><p className="eyebrow">ROUTE ENTRY</p><h3>{editing ? "编辑库存转移" : "跨服库存转移"}</h3></div><label>道具名<input name="itemName" defaultValue={editing?.itemName} required /></label><label>数量<input name="quantity" type="number" min="1" step="1" defaultValue={editing?.quantity} required /></label><label>源区服<input name="sourceServerName" defaultValue={editing?.sourceServerName} required /></label><label>源角色<input name="sourceCharacterName" defaultValue={editing?.sourceCharacterName} required /></label><label>目标区服<input name="targetServerName" defaultValue={editing?.targetServerName} required /></label><label>目标角色<input name="targetCharacterName" defaultValue={editing?.targetCharacterName} required /></label><label>人民币转移成本<input name="transferCostRmb" type="number" min="0" step="any" defaultValue={editing?.transferCostRmb} required /></label><label>发生时间<input name="occurredAt" type="datetime-local" defaultValue={editing ? toLocalDateTimeInput(editing.occurredAt) : localDateTime()} required /></label><button type="submit" disabled={pending}>{editing ? "保存并重新推导" : "保存转移"}</button></form>;
}

function ConfirmDeleteButton({ onConfirm, pending }: { onConfirm: () => void; pending: boolean }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) return <button className="mhxy-delete-button" type="button" onClick={() => setConfirming(true)}>删除</button>;
  return <span className="mhxy-confirm-delete"><button type="button" disabled={pending} onClick={onConfirm}>确认</button><button type="button" onClick={() => setConfirming(false)}>取消</button></span>;
}
