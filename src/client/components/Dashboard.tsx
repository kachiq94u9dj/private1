import type { OverviewResponse } from "../../shared/types";
import { mdw } from "../format";
import { CategoryBars } from "./CategoryBars";
import { GoalsCard } from "./GoalsCard";
import { Heatmap } from "./Heatmap";
import { RankList } from "./RankList";
import { ReportCard } from "./ReportCard";
import { StatTiles } from "./StatTiles";
import { TrendChart } from "./TrendChart";

export function Dashboard({
  data,
  onSelectDate,
  onReload,
}: {
  data: OverviewResponse;
  onSelectDate: (d: string) => void;
  onReload: () => void;
}) {
  if (!data.availableRange.max) {
    return (
      <div className="notice">
        まだデータが届いていません。Mac で収集スクリプトを設定して実行してください（README の「Mac 側のセットアップ」参照）。
      </div>
    );
  }
  const noData = data.today.total === 0;
  return (
    <>
      {noData && <div className="notice">{mdw(data.date)} のデータはありません。</div>}
      <div className="grid">
        <StatTiles data={data} />
        <ReportCard date={data.date} report={data.report} onReload={onReload} />
        <CategoryBars today={data.today} average={data.lastWeekAverage} />
        <GoalsCard goals={data.goals} onEdit={() => (location.search = "?tab=goals")} />
        <TrendChart trend={data.trend} selected={data.date} onSelect={onSelectDate} />
        <RankList title="アプリ" items={data.today.apps} empty="データがありません" />
        <RankList title="Webサイト" items={data.today.domains} empty="閲覧履歴がありません" />
        <Heatmap cells={data.heatmap} selected={data.date} onSelect={onSelectDate} />
      </div>
    </>
  );
}
