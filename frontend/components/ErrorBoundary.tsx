"use client";

import { Component, ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown): void {
    console.error("Uncaught render error:", error);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 py-24 px-4 text-center">
          <p className="text-4xl">⚠️</p>
          <h1 className="text-xl font-bold text-white">Something went wrong.</h1>
          <p className="text-gray-400 max-w-sm">
            An unexpected error occurred. Try reloading the page.
          </p>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="px-4 py-2 rounded-md bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
