"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useWalletClient,
  useSwitchChain,
} from "wagmi";
import { injected } from "wagmi/connectors";
import { wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { x402Client } from "@x402/core/client";
import { monadTestnet } from "@/lib/wagmi";

import "./Home.css";

const LANGUAGES = [
  { code: "en-IN", label: "English" },
  { code: "hi-IN", label: "Hindi" },
  { code: "bn-IN", label: "Bengali" },
  { code: "ta-IN", label: "Tamil" },
  { code: "te-IN", label: "Telugu" },
  { code: "gu-IN", label: "Gujarati" },
  { code: "kn-IN", label: "Kannada" },
  { code: "ml-IN", label: "Malayalam" },
  { code: "mr-IN", label: "Marathi" },
  { code: "pa-IN", label: "Punjabi" },
  { code: "od-IN", label: "Odia" },
];

type Message =
  | { role: "user"; text: string; from: string; to: string }
  | { role: "assistant"; text: string; txHash?: string }
  | { role: "system"; text: string; kind: "info" | "error" | "payment" };

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [showDisconnectModal, setShowDisconnectModal] = useState(false); // New state for modal

  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      text: "Namaste 🙏 I translate between Indian languages instantly. Connect your wallet and pay 0.001 USDC per translation — no account needed.",
    },
  ]);
  const [input, setInput] = useState("");
  const [sourceLang, setSourceLang] = useState("en-IN");
  const [targetLang, setTargetLang] = useState("hi-IN");
  const [loading, setLoading] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { address, isConnected, chainId } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: walletClient } = useWalletClient();
  const { switchChain } = useSwitchChain();

  const isCorrectNetwork = chainId === monadTestnet.id;

  useEffect(() => {
    setMounted(true);
  }, []);

  const push = useCallback((msg: Message) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, 120)}px`;
    }
  }, [input]);

  const handleTranslate = useCallback(async () => {
    if (!input.trim()) return;
    if (sourceLang === targetLang) {
      push({
        role: "system",
        text: "Source and target languages must be different.",
        kind: "error",
      });
      return;
    }
    if (!isConnected || !walletClient || !address) {
      push({
        role: "system",
        text: "Please connect your MetaMask wallet first.",
        kind: "error",
      });
      return;
    }
    if (!isCorrectNetwork) {
      push({
        role: "system",
        text: "Please switch MetaMask to Monad Testnet.",
        kind: "error",
      });
      return;
    }

    const userText = input.trim();
    setInput("");
    push({ role: "user", text: userText, from: sourceLang, to: targetLang });
    setLoading(true);
    push({
      role: "system",
      text: "Signing payment of 0.001 USDC on Monad...",
      kind: "payment",
    });

    try {
      const evmSigner = {
        address: address as `0x${string}`,
        signTypedData: async (message: {
          domain: Record<string, unknown>;
          types: Record<string, unknown>;
          primaryType: string;
          message: Record<string, unknown>;
        }) => {
          return walletClient.signTypedData({
            domain: message.domain as Parameters<
              typeof walletClient.signTypedData
            >[0]["domain"],
            types: message.types as Parameters<
              typeof walletClient.signTypedData
            >[0]["types"],
            primaryType: message.primaryType,
            message: message.message,
          });
        },
      };

      const exactScheme = new ExactEvmScheme(evmSigner);
      const client = new x402Client().register("eip155:10143", exactScheme);
      const paymentFetch = wrapFetchWithPayment(fetch, client);

      const response = await paymentFetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: userText,
          source_language: sourceLang,
          target_language: targetLang,
        }),
      });

      setMessages((prev) =>
        prev.filter((m) => !(m.role === "system" && m.kind === "payment")),
      );

      if (!response.ok) {
        const errData = await response.json();
        push({
          role: "system",
          text: errData.error || "Translation failed.",
          kind: "error",
        });
        return;
      }

      const data = await response.json();
      push({ role: "assistant", text: data.translated_text });
    } catch (err: any) {
      setMessages((prev) =>
        prev.filter((m) => !(m.role === "system" && m.kind === "payment")),
      );
      if (
        err?.message?.includes("User rejected") ||
        err?.message?.includes("user rejected")
      ) {
        push({ role: "system", text: "Payment cancelled.", kind: "error" });
      } else if (err?.message?.includes("insufficient")) {
        push({
          role: "system",
          text: "Insufficient USDC. Get test USDC from faucet.circle.com",
          kind: "error",
        });
      } else {
        push({
          role: "system",
          text: err?.message || "Something went wrong.",
          kind: "error",
        });
      }
    } finally {
      setLoading(false);
    }
  }, [
    input,
    sourceLang,
    targetLang,
    walletClient,
    address,
    isConnected,
    isCorrectNetwork,
    push,
  ]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleTranslate();
    }
  };

  const fromLabel = LANGUAGES.find((l) => l.code === sourceLang)?.label;
  const toLabel = LANGUAGES.find((l) => l.code === targetLang)?.label;

  return (
    <div className="app">
      {/* TOP BAR */}
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon">🌐</div>
          <div>
            <div className="brand-name">KesavaAI</div>
            <div className="brand-sub">x402 · Monad · Sarvam</div>
          </div>
        </div>

        <div className="wallet-area">
          {!mounted || !isConnected ? (
            <button
              className="wallet-btn connect"
              onClick={() => connect({ connector: injected() })}
            >
              Connect MetaMask
            </button>
          ) : !isCorrectNetwork ? (
            <button
              className="wallet-btn switch"
              onClick={() => switchChain({ chainId: monadTestnet.id })}
            >
              Switch to Monad
            </button>
          ) : (
            <>
              <div className="wallet-connected">
                <div className="dot-green" />
                <span className="wallet-addr">
                  {address?.slice(0, 6)}…{address?.slice(-4)}
                </span>
              </div>
              {/* Changed onClick to open the modal */}
              <button
                className="wallet-btn disconnect"
                onClick={() => setShowDisconnectModal(true)}
              >
                Disconnect
              </button>
            </>
          )}
        </div>
      </header>

      {/* LANGUAGE STRIP */}
      <div className="lang-strip">
        <select
          className="lang-select"
          value={sourceLang}
          onChange={(e) => setSourceLang(e.target.value)}
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>

        <span className="lang-arrow">→</span>

        <select
          className="lang-select"
          value={targetLang}
          onChange={(e) => setTargetLang(e.target.value)}
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>

        <span className="lang-label">0.001 USDC / translation</span>
      </div>

      {/* MESSAGES */}
      <div className="messages">
        {messages.map((msg, i) => {
          if (msg.role === "system") {
            return (
              <div key={i} className={`sys-msg ${msg.kind}`}>
                {msg.kind === "payment" && "⟳ "}
                {msg.kind === "error" && "✕ "}
                {msg.text}
              </div>
            );
          }

          if (msg.role === "user") {
            return (
              <div key={i} className="msg-row user">
                <div className="avatar user">👤</div>
                <div>
                  <div className="bubble user">{msg.text}</div>
                  <div className="bubble-meta">
                    {LANGUAGES.find((l) => l.code === msg.from)?.label} →{" "}
                    {LANGUAGES.find((l) => l.code === msg.to)?.label}
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div key={i} className="msg-row">
              <div className="avatar ai">🌐</div>
              <div>
                <div className="bubble ai">{msg.text}</div>
                <div className="bubble-meta">VaakAI · Sarvam Mayura</div>
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="msg-row">
            <div className="avatar ai">🌐</div>
            <div className="bubble ai">
              <div className="typing">
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* INPUT BAR */}
      <div className="inputbar">
        <div className="input-wrap">
          <textarea
            ref={textareaRef}
            className="input-field"
            rows={1}
            placeholder={
              !mounted || !isConnected
                ? "Connect MetaMask to start translating..."
                : !isCorrectNetwork
                  ? "Switch to Monad Testnet to continue..."
                  : `Type in ${fromLabel} — translate to ${toLabel}...`
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading || !mounted || !isConnected || !isCorrectNetwork}
          />
          <button
            className="send-btn"
            onClick={handleTranslate}
            disabled={
              loading ||
              !input.trim() ||
              !mounted ||
              !isConnected ||
              !isCorrectNetwork
            }
          >
            ↑
          </button>
        </div>
        <div className="input-hint">
          Enter ↵ to send · Shift+Enter for new line · Powered by x402 Protocol
        </div>
      </div>

      {/* DISCONNECT CONFIRMATION MODAL */}
      {showDisconnectModal && (
        <div
          className="modal-backdrop"
          onClick={() => setShowDisconnectModal(false)}
        >
          {/* stopPropagation prevents clicking inside the modal from closing it */}
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Disconnect Wallet?</div>
            <div className="modal-message">
              Are you sure you want to disconnect? You will need to reconnect to
              continue translating.
            </div>
            <div className="modal-actions">
              <button
                className="modal-btn cancel"
                onClick={() => setShowDisconnectModal(false)}
              >
                Cancel
              </button>
              <button
                className="modal-btn confirm"
                onClick={() => {
                  disconnect();
                  setShowDisconnectModal(false);
                }}
              >
                Disconnect
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
