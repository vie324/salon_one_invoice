import * as React from "react";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------
   一覧テーブル。
   スマートフォン(md 未満)では 1行を1枚のカードに積み替えて表示する。
   その際、各セルには対応する見出し(TH)の文言をラベルとして自動で付ける
   ため、呼び出し側は今までどおり THead / TBody / TR / TH / TD を書けばよい。
   横スクロールのままにしたい表は <Table mobile="scroll"> を指定する。
   ------------------------------------------------------------------------- */

/** 要素ツリーから表示テキストだけを取り出す(見出しラベルの生成用) */
function textOf(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (React.isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode };
    return textOf(props.children);
  }
  return "";
}

/** THead > TR に並ぶ TH の文言を順番どおりに集める */
function headerLabels(children: React.ReactNode): string[] {
  const labels: string[] = [];
  let found = false;

  const visitRow = (row: React.ReactNode) => {
    if (!React.isValidElement(row)) return;
    const rowProps = row.props as { children?: React.ReactNode };
    React.Children.forEach(rowProps.children, (cell) => {
      if (React.isValidElement(cell)) {
        const cellProps = cell.props as { children?: React.ReactNode };
        labels.push(textOf(cellProps.children).trim());
      } else {
        // 条件付きで消えたセル。TD 側も同じ条件で消えるので位置合わせのため詰める
        labels.push("");
      }
    });
  };

  React.Children.forEach(children, (child) => {
    if (found || !React.isValidElement(child) || child.type !== THead) return;
    const props = child.props as { children?: React.ReactNode };
    React.Children.forEach(props.children, (row) => {
      if (found) return;
      visitRow(row);
      found = true;
    });
  });
  return labels;
}

/** TBody の各 TD に data-label(見出し文言)を差し込んだ複製を返す */
function withCellLabels(children: React.ReactNode, labels: string[]): React.ReactNode {
  if (labels.length === 0) return children;

  const decorateRow = (row: React.ReactNode): React.ReactNode => {
    if (!React.isValidElement(row) || row.type !== TR) return row;
    const rowProps = row.props as { children?: React.ReactNode };
    let index = -1;
    const cells = React.Children.map(rowProps.children, (cell) => {
      index += 1;
      if (!React.isValidElement(cell) || cell.type !== TD) return cell;
      const cellProps = cell.props as Record<string, unknown>;
      // 明示指定・colSpan(「該当なし」行など)はそのまま
      if (cellProps["data-label"] !== undefined || cellProps.colSpan !== undefined) return cell;
      const label = labels[index] ?? "";
      return React.cloneElement(cell as React.ReactElement<Record<string, unknown>>, {
        "data-label": label,
      });
    });
    return React.cloneElement(row as React.ReactElement<Record<string, unknown>>, undefined, cells);
  };

  return React.Children.map(children, (child) => {
    if (!React.isValidElement(child) || child.type !== TBody) return child;
    const props = child.props as { children?: React.ReactNode };
    return React.cloneElement(
      child as React.ReactElement<Record<string, unknown>>,
      undefined,
      React.Children.map(props.children, decorateRow),
    );
  });
}

export function Table({
  className,
  children,
  mobile = "cards",
  ...props
}: React.HTMLAttributes<HTMLTableElement> & {
  /** スマホ表示: cards = 1行1カード(既定) / scroll = 横スクロールのまま */
  mobile?: "cards" | "scroll";
}) {
  const cards = mobile === "cards";
  const content = cards ? withCellLabels(children, headerLabels(children)) : children;
  return (
    <div
      className={cn(
        "w-full scrollbar-thin",
        cards ? "md:overflow-x-auto" : "overflow-x-auto",
        cards && "table-cards",
      )}
    >
      <table className={cn("w-full caption-bottom text-sm", className)} {...props}>
        {content}
      </table>
    </div>
  );
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn(
        "border-b border-border text-xs uppercase tracking-wide text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("divide-y divide-border", className)} {...props} />;
}

export function TR({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("transition-colors hover:bg-muted/50", className)} {...props} />;
}

export function TH({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("px-3 py-2.5 text-left font-medium", className)} {...props} />;
}

export function TD({
  className,
  primary,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & {
  /** カード表示のときに見出し(行の主役)として大きく置くセル */
  primary?: boolean;
}) {
  return (
    <td
      className={cn("px-3 py-3 align-middle", className)}
      {...(primary ? { "data-primary": "" } : null)}
      {...props}
    />
  );
}
