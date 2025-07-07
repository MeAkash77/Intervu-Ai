"use client";

import { useEffect, useState } from "react";
import { vapi } from "@/lib/vapi.sdk";
import { useRouter } from "next/navigation";
import { interviewer } from "@/constants";
import { toast } from "sonner";
import { generateFeedbackAction } from "@/lib/actions/general.actions";
import Image from "next/image";
import { cn } from "@/lib/utils";

enum CallStatuses {
  INACTIVE = "INACTIVE",
  CONNECTING = "CONNECTING",
  ACTIVE = "ACTIVE",
  FINISHED = "FINISHED",
}

interface SavedMessage {
  role: "user" | "system" | "assistant";
  content: string;
}

function InterviewAgent({
  type,
  username,
  userId,
  interviewId,
  questions,
}: InterviewAgentProps) {
  const [isVapiAssistantTalking, setIsVapiAssistantTalking] = useState(false);
  const [callStatus, setCallStatus] = useState<CallStatuses>(CallStatuses.INACTIVE);
  const [messages, setMessages] = useState<SavedMessage[]>([]);
  const router = useRouter();

  useEffect(() => {
    const onCallStart = () => setCallStatus(CallStatuses.ACTIVE);
    const onCallEnd = () => setCallStatus(CallStatuses.FINISHED);

    const onMessage = (message: Message) => {
      if (message.type === "transcript" && message.transcriptType === "final") {
        const newMessage: SavedMessage = {
          role: message.role,
          content: message.transcript,
        };
        setMessages((prevState) => [...prevState, newMessage]);
      }
    };

    const onSpeechStart = () => setIsVapiAssistantTalking(true);
    const onSpeechEnd = () => setIsVapiAssistantTalking(false);

    const onError = (e: any) => {
      console.error("💥 Vapi agent error:", e);
      const errorMsg = e?.message || JSON.stringify(e) || "Unknown error";
      toast.error(`Vapi Error: ${errorMsg}`);
      alert(`Vapi Error: ${errorMsg}`);
      setCallStatus(CallStatuses.FINISHED);
    };

    vapi.on("call-start", onCallStart);
    vapi.on("call-end", onCallEnd);
    vapi.on("message", onMessage);
    vapi.on("speech-start", onSpeechStart);
    vapi.on("speech-end", onSpeechEnd);
    vapi.on("error", onError);

    return () => {
      vapi.off("call-start", onCallStart);
      vapi.off("call-end", onCallEnd);
      vapi.off("message", onMessage);
      vapi.off("speech-start", onSpeechStart);
      vapi.off("speech-end", onSpeechEnd);
      vapi.off("error", onError);
    };
  }, []);

  const handleConnectCall = async () => {
    setCallStatus(CallStatuses.CONNECTING);

    try {
      if (type === "generate") {
        console.log("🔑 Vapi Assistant ID:", process.env.NEXT_PUBLIC_VAPI_WORKFLOW_ASSISTANT_ID);

        await vapi.start(process.env.NEXT_PUBLIC_VAPI_WORKFLOW_ASSISTANT_ID!, {
          variableValues: { username, userId },
        });
      } else {
        const formattedQuestions = questions?.map((q) => `- ${q}`).join("\n") || "";

        console.log("🎤 Interview agent ID:", interviewer);
        await vapi.start(interviewer, {
          variableValues: { questions: formattedQuestions },
        });
      }
    } catch (err: any) {
      console.error("❌ Vapi start failed:", err);
      toast.error("Failed to start Vapi call.");
      alert("Vapi failed to start: " + (err?.message || "Unknown error"));
      setCallStatus(CallStatuses.FINISHED);
    }
  };

  const handleDisconnectCall = () => {
    setCallStatus(CallStatuses.FINISHED);
    vapi.stop();
  };

  const handleGenerateFeedback = async (messages: SavedMessage[]) => {
    if (userId && interviewId) {
      const { success, feedbackId, error } = await generateFeedbackAction({
        interviewId,
        userId,
        transcript: messages,
      });

      if (success && feedbackId) {
        router.push(`/interview/${interviewId}/feedback`);
      } else {
        console.error("⚠️ Error generating feedback:", error);
        toast.error(error?.message || "Feedback error.");
        router.push("/");
      }
    }
  };

  useEffect(() => {
    if (callStatus === CallStatuses.FINISHED) {
      if (type === "generate") {
        toast.info(
          "Your interview is being generated. You'll be redirected to the homepage shortly. Check the 'Your Interviews' section to find it once it's ready.",
          { duration: 5000 }
        );

        setTimeout(() => {
          router.push("/");
        }, 2000);
      } else {
        handleGenerateFeedback(messages);
      }
    }
  }, [type, userId, callStatus, messages, router]);

  const latestMessage = messages.at(-1)?.content;
  const isCallStatusInactiveOrFinished =
    callStatus === CallStatuses.INACTIVE || callStatus === CallStatuses.FINISHED;

  return (
    <>
      <div className="call-view">
        <section className="card-interviewer">
          <div className="avatar">
            <Image src="/ai-avatar.png" alt="Vapi avatar" width={65} height={54} className="object-cover" />
            {isVapiAssistantTalking && <span className="animate-talking" />}
          </div>
          <h3 className="capitalize">VoxNavi</h3>
        </section>

        <section className="card-border">
          <div className="card-content">
            <Image
              src="/user-avatar.webp"
              alt={username ? `${username}'s avatar` : "Your avatar"}
              width={540}
              height={540}
              className="size-[120px] rounded-full object-cover"
            />
            <h3 className="capitalize">{username} (You)</h3>
          </div>
        </section>
      </div>

      {messages.length > 0 && (
        <div className="transcript-border mt-[1.5rem]">
          <div className="transcript">
            <p className={cn("opacity-0 transition-opacity duration-500", "opacity-100 animate-fadeIn")}>
              {latestMessage}
            </p>
          </div>
        </div>
      )}

      <div className="w-full mt-[2.25rem] flex justify-center">
        {callStatus === CallStatuses.ACTIVE ? (
          <button type="button" onClick={handleDisconnectCall} className="btn-disconnect">
            End
          </button>
        ) : (
          <button
            type="button"
            onClick={handleConnectCall}
            disabled={callStatus === CallStatuses.CONNECTING}
            className="btn-call"
          >
            {isCallStatusInactiveOrFinished ? "Call" : "Connecting..."}
          </button>
        )}
      </div>
    </>
  );
}

export default InterviewAgent;
