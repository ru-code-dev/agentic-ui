import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vite-plus/test";
import { Badge } from "./badge.tsx";
import { Button } from "./button.tsx";
import { Checkbox } from "./checkbox.tsx";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "./empty.tsx";
import { Input } from "./input.tsx";
import { Kbd, KbdGroup } from "./kbd.tsx";
import { Label } from "./label.tsx";
import { ScrollArea } from "./scroll-area.tsx";
import { SegmentedControl, SegmentedControlItem } from "./segmented-control.tsx";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "./select.tsx";
import { Separator } from "./separator.tsx";
import { Spinner } from "./spinner.tsx";
import { Switch } from "./switch.tsx";
import { Tabs, TabsList, TabsPanel, TabsTab } from "./tabs.tsx";
import { Textarea } from "./textarea.tsx";
import { Toggle } from "./toggle.tsx";
import { ToggleGroup, ToggleGroupItem } from "./toggle-group.tsx";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./tooltip.tsx";

/** A callback ref: assignable to the ref type of every element. */
type CaptureRef = (node: Element | null) => void;
type Case = readonly [string, (ref: CaptureRef) => ReactElement];

/** Every generated primitive that renders a DOM element, rendered with a ref (S01-I5). */
const CASES: readonly Case[] = [
  ["Badge", (ref) => <Badge ref={ref}>Новое</Badge>],
  ["Button", (ref) => <Button ref={ref}>Сохранить</Button>],
  ["Checkbox", (ref) => <Checkbox ref={ref} aria-label="Согласен" />],
  ["Empty", (ref) => <Empty ref={ref}>Пусто</Empty>],
  ["EmptyHeader", (ref) => <EmptyHeader ref={ref}>Заголовок</EmptyHeader>],
  ["EmptyMedia", (ref) => <EmptyMedia ref={ref}>•</EmptyMedia>],
  ["EmptyTitle", (ref) => <EmptyTitle ref={ref}>Нет данных</EmptyTitle>],
  ["EmptyDescription", (ref) => <EmptyDescription ref={ref}>Описание</EmptyDescription>],
  ["EmptyContent", (ref) => <EmptyContent ref={ref}>Содержимое</EmptyContent>],
  ["Input", (ref) => <Input ref={ref} aria-label="Имя" />],
  ["Kbd", (ref) => <Kbd ref={ref}>⌘</Kbd>],
  ["KbdGroup", (ref) => <KbdGroup ref={ref}>⌘S</KbdGroup>],
  ["Label", (ref) => <Label ref={ref}>Подпись</Label>],
  ["ScrollArea", (ref) => <ScrollArea ref={ref}>Прокрутка</ScrollArea>],
  ["SegmentedControl", (ref) => <SegmentedControl ref={ref}>Сегменты</SegmentedControl>],
  [
    "SegmentedControlItem",
    (ref) => (
      <SegmentedControl>
        <SegmentedControlItem ref={ref}>Один</SegmentedControlItem>
      </SegmentedControl>
    ),
  ],
  ["Separator", (ref) => <Separator ref={ref} />],
  ["Spinner", (ref) => <Spinner ref={ref} />],
  ["Switch", (ref) => <Switch ref={ref} aria-label="Вкл" />],
  ["Textarea", (ref) => <Textarea ref={ref} aria-label="Текст" />],
  ["Toggle", (ref) => <Toggle ref={ref}>Жирный</Toggle>],
  [
    "ToggleGroup",
    (ref) => (
      <ToggleGroup ref={ref}>
        <ToggleGroupItem value="a">A</ToggleGroupItem>
      </ToggleGroup>
    ),
  ],
  [
    "ToggleGroupItem",
    (ref) => (
      <ToggleGroup>
        <ToggleGroupItem ref={ref} value="a">
          A
        </ToggleGroupItem>
      </ToggleGroup>
    ),
  ],
  [
    "Tabs",
    (ref) => (
      <Tabs ref={ref} defaultValue="a">
        <TabsList>
          <TabsTab value="a">A</TabsTab>
        </TabsList>
      </Tabs>
    ),
  ],
  [
    "TabsList",
    (ref) => (
      <Tabs defaultValue="a">
        <TabsList ref={ref}>
          <TabsTab value="a">A</TabsTab>
        </TabsList>
      </Tabs>
    ),
  ],
  [
    "TabsTab",
    (ref) => (
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTab ref={ref} value="a">
            A
          </TabsTab>
        </TabsList>
      </Tabs>
    ),
  ],
  [
    "TabsPanel",
    (ref) => (
      <Tabs defaultValue="a">
        <TabsPanel ref={ref} value="a">
          Панель
        </TabsPanel>
      </Tabs>
    ),
  ],
  [
    "SelectTrigger",
    (ref) => (
      <Select>
        <SelectTrigger ref={ref}>
          <SelectValue />
        </SelectTrigger>
      </Select>
    ),
  ],
  [
    "SelectValue",
    (ref) => (
      <Select>
        <SelectTrigger>
          <SelectValue ref={ref} />
        </SelectTrigger>
      </Select>
    ),
  ],
  [
    "SelectPopup",
    (ref) => (
      <Select open>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectPopup ref={ref}>
          <SelectItem value="a">A</SelectItem>
        </SelectPopup>
      </Select>
    ),
  ],
  [
    "SelectItem",
    (ref) => (
      <Select open>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectPopup>
          <SelectItem ref={ref} value="a">
            A
          </SelectItem>
        </SelectPopup>
      </Select>
    ),
  ],
  [
    "TooltipTrigger",
    (ref) => (
      <Tooltip>
        <TooltipTrigger ref={ref}>?</TooltipTrigger>
      </Tooltip>
    ),
  ],
  [
    "TooltipPopup",
    (ref) => (
      <Tooltip open>
        <TooltipTrigger>?</TooltipTrigger>
        <TooltipPopup ref={ref}>Подсказка</TooltipPopup>
      </Tooltip>
    ),
  ],
];

describe("@coss registry components under React 18 (S01-I5)", () => {
  let error: MockInstance;
  beforeEach(() => {
    error = vi.spyOn(console, "error");
  });
  afterEach(() => {
    expect(
      error.mock.calls.filter(([message]) => String(message).includes("cannot be given refs")),
    ).toEqual([]);
    error.mockRestore();
  });

  it.each(CASES)("%s forwards its ref to a DOM element", (_name, build) => {
    let node: Element | null = null;
    render(
      build((element) => {
        node ??= element;
      }),
    );
    expect(node).toBeInstanceOf(Element);
  });

  it("switches Tabs panels on click", async () => {
    render(
      <Tabs defaultValue="json">
        <TabsList>
          <TabsTab value="json">JSON</TabsTab>
          <TabsTab value="schema">Schema</TabsTab>
        </TabsList>
        <TabsPanel value="json">json-panel</TabsPanel>
        <TabsPanel value="schema">schema-panel</TabsPanel>
      </Tabs>,
    );
    await userEvent.click(screen.getByRole("tab", { name: "Schema" }));
    expect(screen.getByText("schema-panel")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Schema" }).getAttribute("aria-selected")).toBe("true");
  });
});
