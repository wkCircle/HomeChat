import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModelSelector } from "./ModelSelector";

const models = ["gpt-5", "claude-sonnet"];

function renderSelector(onSelect = vi.fn()) {
  render(
    <ModelSelector
      models={models}
      selectedModel="gpt-5"
      contextWindows={{ "gpt-5": 128_000, "claude-sonnet": 200_000 }}
      pricing={{ "gpt-5": null, "claude-sonnet": null }}
      onSelect={onSelect}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Select model, currently gpt-5" }),
  );
  return onSelect;
}

afterEach(() => vi.useRealTimers());

describe("ModelSelector touch interactions", () => {
  it("selects a model with a short tap", () => {
    const onSelect = renderSelector();
    const option = screen.getByRole("option", { name: "claude-sonnet" });

    fireEvent.pointerDown(option, { pointerType: "touch" });
    fireEvent.pointerUp(option, { pointerType: "touch" });
    fireEvent.click(option);

    expect(onSelect).toHaveBeenCalledWith("claude-sonnet");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("shows model details on a long press without selecting", () => {
    vi.useFakeTimers();
    const onSelect = renderSelector();
    const option = screen.getByRole("option", { name: "claude-sonnet" });

    fireEvent.pointerDown(option, { pointerType: "touch" });
    act(() => vi.advanceTimersByTime(500));

    expect(screen.getByRole("tooltip")).toHaveTextContent("claude-sonnet");

    fireEvent.pointerUp(option, { pointerType: "touch" });
    fireEvent.click(option);

    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });
});