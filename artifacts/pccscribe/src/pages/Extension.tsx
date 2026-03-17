import { useState } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Download, Chrome, Settings2, CheckCircle2,
  Puzzle, Globe, Clipboard, ExternalLink, ChevronRight,
  Stethoscope, Zap, Shield
} from "lucide-react";

const API_URL = `${window.location.origin}/api`;

export default function Extension() {
  const [copied, setCopied] = useState(false);

  const copyUrl = () => {
    navigator.clipboard.writeText(API_URL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const steps = [
    {
      number: 1,
      icon: <Download className="w-5 h-5" />,
      title: "Download the Extension",
      description: "Download the PCCScribe browser extension package (.zip file).",
      action: (
        <a href={`${import.meta.env.BASE_URL}pccscribe-extension.zip`} download="pccscribe-extension.zip">
          <Button className="bg-primary text-white hover:bg-primary/90 shadow-md shadow-primary/20 w-full">
            <Download className="w-4 h-4 mr-2" />
            Download Extension (.zip)
          </Button>
        </a>
      ),
    },
    {
      number: 2,
      icon: <Chrome className="w-5 h-5" />,
      title: "Install in Chrome",
      description: "Unzip the file, then load it as an unpacked extension in Chrome.",
      steps: [
        "Unzip the downloaded file to a folder on your computer",
        'Open Chrome and go to chrome://extensions',
        'Enable "Developer mode" using the toggle in the top-right corner',
        'Click "Load unpacked" and select the unzipped folder',
        "The PCCScribe extension icon will appear in your toolbar",
      ],
    },
    {
      number: 3,
      icon: <Settings2 className="w-5 h-5" />,
      title: "Configure Your API URL",
      description: "Tell the extension where your PCCScribe app lives by copying the URL below.",
      action: (
        <div className="space-y-3">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
            <code className="text-sm text-primary font-mono flex-1 truncate">{API_URL}</code>
            <Button
              variant="ghost"
              size="sm"
              onClick={copyUrl}
              className="shrink-0 text-slate-500 hover:text-primary"
            >
              {copied ? (
                <><CheckCircle2 className="w-4 h-4 mr-1.5 text-green-500" />Copied!</>
              ) : (
                <><Clipboard className="w-4 h-4 mr-1.5" />Copy</>
              )}
            </Button>
          </div>
          <p className="text-xs text-slate-500">
            Click the extension icon in Chrome → Settings (gear icon) → paste this URL → Save
          </p>
        </div>
      ),
    },
    {
      number: 4,
      icon: <Globe className="w-5 h-5" />,
      title: "Open PCC & Sync Notes",
      description: "Navigate to PointClickCare in Chrome. The extension will automatically detect the page.",
      steps: [
        "Go to app.pointclickcare.com and log in",
        "Open a patient's chart",
        "Click the blue PCCScribe button in the bottom-right corner",
        "Select or create the matching patient in PCCScribe",
        "Choose the note type and click Fetch & Sync Notes",
        "Return here to generate an AI summary!",
      ],
      action: (
        <a href="https://app.pointclickcare.com" target="_blank" rel="noopener noreferrer">
          <Button variant="outline" className="border-slate-200 w-full">
            <ExternalLink className="w-4 h-4 mr-2" />
            Open PointClickCare
          </Button>
        </a>
      ),
    },
  ];

  const features = [
    {
      icon: <Zap className="w-5 h-5 text-amber-500" />,
      title: "Auto-Detection",
      description: "Automatically identifies patient name and note type from the PCC page",
    },
    {
      icon: <Shield className="w-5 h-5 text-green-500" />,
      title: "Secure & Private",
      description: "Notes go directly from your browser to your PCCScribe instance — no third parties",
    },
    {
      icon: <Puzzle className="w-5 h-5 text-violet-500" />,
      title: "All Note Types",
      description: "Supports progress notes, orders, MAR, care plans, nursing notes, and more",
    },
    {
      icon: <Stethoscope className="w-5 h-5 text-primary" />,
      title: "AI Summaries",
      description: "Synced notes are ready to generate SOAP summaries with a single click",
    },
  ];

  return (
    <Layout>
      {/* Hero */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Puzzle className="w-6 h-6 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-display font-bold text-slate-900">Browser Extension</h1>
              <Badge className="bg-green-100 text-green-700 border-green-200">Chrome</Badge>
            </div>
            <p className="text-slate-500 mt-0.5">
              Fetch clinical notes directly from PointClickCare and sync them to PCCScribe in one click.
            </p>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        {features.map((f) => (
          <div key={f.title} className="bg-white border border-slate-200/60 rounded-xl p-4 shadow-sm">
            <div className="w-9 h-9 rounded-lg bg-slate-50 flex items-center justify-center mb-3">
              {f.icon}
            </div>
            <p className="font-semibold text-slate-900 text-sm mb-1">{f.title}</p>
            <p className="text-xs text-slate-500 leading-relaxed">{f.description}</p>
          </div>
        ))}
      </div>

      {/* Steps */}
      <div className="space-y-4">
        <h2 className="text-lg font-display font-semibold text-slate-900">Setup Guide</h2>
        {steps.map((step, i) => (
          <div
            key={step.number}
            className="bg-white border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm"
          >
            <div className="flex items-start gap-4 p-6">
              {/* Step number + connector */}
              <div className="flex flex-col items-center shrink-0">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm border-2 border-primary/20">
                  {step.number}
                </div>
                {i < steps.length - 1 && (
                  <div className="w-px flex-1 bg-slate-200 mt-2 min-h-[20px]" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <div className="text-slate-600">{step.icon}</div>
                  <h3 className="font-semibold text-slate-900">{step.title}</h3>
                </div>
                <p className="text-sm text-slate-500 mb-4">{step.description}</p>

                {"steps" in step && step.steps && (
                  <ol className="space-y-2 mb-4">
                    {step.steps.map((s, si) => (
                      <li key={si} className="flex items-start gap-3 text-sm text-slate-600">
                        <span className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-xs font-semibold text-slate-500 shrink-0 mt-0.5">
                          {si + 1}
                        </span>
                        <span>
                          {s.includes("chrome://extensions") ? (
                            <>
                              {s.replace("chrome://extensions", "")}
                              <code className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-mono text-xs">chrome://extensions</code>
                            </>
                          ) : s}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}

                {"action" in step && step.action && (
                  <div>{step.action}</div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Help footer */}
      <div className="mt-8 bg-slate-50 border border-slate-200/60 rounded-2xl p-6 flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <CheckCircle2 className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-slate-900 text-sm">All set? Generate your first summary</p>
          <p className="text-xs text-slate-500 mt-0.5">After syncing notes, open a patient and click Generate Summary to run AI analysis.</p>
        </div>
        <a href="/">
          <Button variant="outline" size="sm" className="border-slate-200 shrink-0">
            Go to Patients <ChevronRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </a>
      </div>
    </Layout>
  );
}
