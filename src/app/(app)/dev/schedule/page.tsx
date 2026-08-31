import { CalendarRange } from "lucide-react";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { getServiceRepository } from "@/lib/data";
import { canEditDevSchedule, canViewDevSchedule } from "@/lib/domain/constants";
import {
  formatWeekLabel,
  isCarriedOver,
  isThisWeek,
  itemMonth,
  sortScheduleItems,
  timelineMonths,
  weekRange,
} from "@/lib/domain/dev-schedule";
import type { UserProfile } from "@/lib/domain/types";
import { ScheduleBoard } from "./schedule-board";

export const metadata = { title: "開発スケジュール" };

// 依頼の最新ステータスと連動するため、常にサーバーで描画する
export const dynamic = "force-dynamic";

export default async function DevSchedulePage() {
  const user = await requireUser();
  // 閲覧を許可されたメンバーだけが開ける(管理者は常に閲覧可)
  if (!canViewDevSchedule(user)) redirect("/dev");

  const repo = await getServiceRepository();
  const editable = canEditDevSchedule(user.roles);

  const items = await repo.listDevScheduleItems();

  // 閲覧メンバーの設定は管理者だけが触るため、必要なときだけ読む
  let profiles: UserProfile[] = [];
  if (editable) {
    try {
      profiles = await repo.listUserProfiles();
    } catch {
      profiles = [];
    }
  }

  const now = new Date();
  const week = weekRange(now);
  const sorted = sortScheduleItems(items);
  const thisWeek = sorted.filter((i) => isThisWeek(i, week));
  const carriedOver = sorted.filter((i) => isCarriedOver(i, week) && !isThisWeek(i, week));
  const months = timelineMonths(items, { now });

  return (
    <div>
      <PageHeader
        title="開発スケジュール"
        description={`${formatWeekLabel(week)}に進める分をいちばん上に出します。機能ごとに開発進捗の依頼をまとめてあるので、番号を追わなくても状況が分かります。`}
      />

      {sorted.length === 0 ? (
        <Card className="p-8 text-center">
          <CalendarRange className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">スケジュールはまだ空です</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {editable
              ? "「機能を追加」から、カテゴリ・機能名・対応する月を登録してください。"
              : "管理者が登録すると、ここに中長期の予定が表示されます。"}
          </p>
        </Card>
      ) : null}

      <ScheduleBoard
        editable={editable}
        week={week}
        weekLabel={formatWeekLabel(week)}
        months={months}
        items={sorted.map((i) => ({ ...i, month: itemMonth(i) }))}
        thisWeekIds={thisWeek.map((i) => i.id)}
        carriedOverIds={carriedOver.map((i) => i.id)}
        members={profiles.map((p) => ({
          id: p.id,
          name: p.name,
          roles: p.roles,
          scheduleVisible: p.scheduleVisible,
        }))}
      />
    </div>
  );
}
