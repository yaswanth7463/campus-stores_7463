(() => {
  "use strict";

  const storageKey = "campus-stores.shift.v1";
  const root = document.getElementById("campus-stores");
  const q = (selector) => root.querySelector(selector);
  const qAll = (selector) => root.querySelectorAll(selector);

  // Core Request Records
  const requests = [
    {
      id: "RQ-214",
      club: "Film Society",
      event: "Courtyard screening",
      owner: "Isha Rao",
      due: "Fri 8 pm",
      items: ["HDMI projector", "Portable speaker", "USB-C → HDMI adapter"],
      note: "Playback is from a USB-C-only laptop. The host will collect at 4 pm.",
    },
    {
      id: "RQ-209",
      club: "Debate Union",
      event: "Finals rehearsal",
      owner: "Tara Shah",
      due: "Sat 10 am",
      items: ["Wireless microphone"],
      note: "Rehearsal runs into the evening.",
    },
    {
      id: "RQ-217",
      club: "Photo Circle",
      event: "Street portrait walk",
      owner: "Dev Menon",
      due: "Sat noon",
      items: ["Digital camera"],
      note: "Collection on Saturday morning.",
    },
  ];

  // Physical Inventory Assets
  const assets = [
    { id: "PR-04", type: "HDMI projector", model: "BenQ MH550", bin: "A2" },
    {
      id: "PR-06",
      type: "HDMI projector",
      model: "Epson EB-X49",
      bin: "Workshop",
      repair: true,
    },
    { id: "SP-02", type: "Portable speaker", model: "JBL Eon One", bin: "B1" },
    { id: "SP-05", type: "Portable speaker", model: "Bose S1", bin: "B2" },
    {
      id: "AD-12",
      type: "USB-C → HDMI adapter",
      model: "Belkin AVC002",
      bin: "C4",
    },
    {
      id: "AD-15",
      type: "USB-C → HDMI adapter",
      model: "Anker A8312",
      bin: "C4",
    },
    { id: "MI-09", type: "Wireless microphone", model: "Shure BLX", bin: "B3" },
    { id: "CA-03", type: "Digital camera", model: "Sony A6400", bin: "D2" },
  ];

  const people = [
    "Isha Rao",
    "Kabir Sen",
    "Leela Das",
    "Tara Shah",
    "Dev Menon",
  ];

  const shifts = [
    {
      time: "Friday · 3:45 pm",
      shortTime: "Fri 3:45 pm",
      title: "Pickup at the counter",
      text: "Kabir is here for the Film Society screening. The film starts at four. Can he leave with everything he needs?",
      next: "Move to return time",
    },
    {
      time: "Friday · 7:30 pm",
      shortTime: "Fri 7:30 pm",
      title: "The kit comes back in pieces",
      text: "Kabir has brought back the projector and speaker. “Leela still has the adapter. She’ll drop it off tomorrow at nine.” Take the return and hand over to the morning shift.",
      next: "Move to next morning",
    },
    {
      time: "Saturday · 9:00 am",
      shortTime: "Sat 9:00 am",
      title: "Morning shift",
      text: "You’ve just taken over. Leela walks in with an adapter. Work out what was outstanding from the screening and close the loan for the right item.",
    },
  ];

  // Comparable Timeline Representation (minutes from Friday 00:00)
  const DUE_MINUTES = {
    "Fri 8 pm": 20 * 60,         // 1200
    "Sat 9 am": (24 + 9) * 60,   // 1980
    "Sat 10 am": (24 + 10) * 60, // 2040
    "Sat noon": (24 + 12) * 60,  // 2160
  };

  const SHIFT_MINUTES = [
    15 * 60 + 45,                // Phase 0: Fri 3:45 pm = 945
    19 * 60 + 30,                // Phase 1: Fri 7:30 pm = 1170
    (24 + 9) * 60,               // Phase 2: Sat 9:00 am = 1980
  ];

  const pages = [
    ["Requests", "clipboard-list"],
    ["Inventory", "package"],
    ["Loan register", "book-open"],
    ["Desk book", "messages-square"],
  ];

  // Baseline Initial Shift State
  const original = () => ({
    version: 1,
    tab: "Requests",
    phase: 0,
    selected: "",
    filter: "All items",
    inventorySearch: "",
    registerSearch: "",
    loans: [
      {
        num: 401,
        req: "RQ-209",
        asset: "MI-09",
        who: "Tara Shah",
        holder: "Tara Shah",
        due: "Sat 10 am",
        back: false,
        note: "",
      },
    ],
    notes: [],
    editing: false,
    reassigningSlip: null,
    onlyOpen: true,
    notice: "Sample shift · All records are fictional.",
    lastReturnedSlip: null,
  });

  let s = original();

  // Lookups & Availability (purely derived)
  const getAsset = (id) => assets.find((x) => x.id === id);
  const getReq = (id) => requests.find((x) => x.id === id);
  const out = (id) => s.loans.find((l) => l.asset === id && !l.back);

  // Due & Overdue Evaluation
  function isOverdue(loan, phase) {
    if (loan.back) return false;
    const dueMin = DUE_MINUTES[loan.due];
    const shiftMin = SHIFT_MINUTES[phase];
    if (dueMin === undefined || shiftMin === undefined) return false;
    return shiftMin > dueMin;
  }

  function getDueStatus(loan, phase) {
    if (loan.back) return { overdue: false, text: "Returned" };
    const dueMin = DUE_MINUTES[loan.due];
    const shiftMin = SHIFT_MINUTES[phase];
    if (dueMin === undefined || shiftMin === undefined) {
      return { overdue: false, text: "Due " + loan.due };
    }
    if (shiftMin > dueMin) {
      const diff = shiftMin - dueMin;
      const hrs = Math.floor(diff / 60);
      return {
        overdue: true,
        text: "OVERDUE by " + (hrs > 0 ? hrs + "h" : diff + "m"),
      };
    }
    const diff = dueMin - shiftMin;
    const hrs = Math.floor(diff / 60);
    const mins = diff % 60;
    if (hrs === 0) {
      return { overdue: false, text: "Due in " + mins + "m" };
    }
    return { overdue: false, text: "Due " + loan.due };
  }

  // Derived Request Status (never stored in state)
  function getRequestStatus(reqId) {
    const r = getReq(reqId);
    if (!r) return { label: "Unknown", code: "unknown", badge: "" };
    const reqLoans = s.loans.filter((l) => l.req === reqId);
    const activeLoans = reqLoans.filter((l) => !l.back);
    const returnedLoans = reqLoans.filter((l) => l.back);
    const totalItems = r.items.length;

    if (reqLoans.length === 0) {
      return {
        label: "Not issued",
        code: "unissued",
        badge: "",
        progress: "0/" + totalItems + " out",
      };
    }
    if (activeLoans.length === 0 && returnedLoans.length >= totalItems) {
      return {
        label: "Completed",
        code: "complete",
        badge: "badge-ok",
        progress: totalItems + "/" + totalItems + " returned",
      };
    }
    if (returnedLoans.length > 0 && activeLoans.length > 0) {
      return {
        label: "Partly returned",
        code: "part-returned",
        badge: "badge-warn",
        progress: returnedLoans.length + "/" + totalItems + " returned (" + activeLoans.length + " out)",
      };
    }
    if (activeLoans.length >= totalItems) {
      return {
        label: "All issued",
        code: "all-out",
        badge: "badge-info",
        progress: totalItems + "/" + totalItems + " on loan",
      };
    }
    return {
      label: "Partly out",
      code: "part-out",
      badge: "badge-info",
      progress: activeLoans.length + "/" + totalItems + " out",
    };
  }

  // HTML escaping utility
  const esc = (x) =>
    String(x ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );

  const opts = (list) =>
    list
      .map(([v, t]) => '<option value="' + esc(v) + '">' + esc(t) + "</option>")
      .join("");

  const btn = (label, act, val = "", style = "", title = "") =>
    '<button type="button" data-action="' +
    esc(act) +
    '" data-val="' +
    esc(val) +
    '" class="' +
    esc(style) +
    '"' +
    (title ? ' title="' + esc(title) + '"' : "") +
    ">" +
    esc(label) +
    "</button>";

  const binChip = (bin) =>
    '<span class="bin-chip' +
    (bin === "Workshop" ? " workshop" : "") +
    '"><svg class="store-icon" aria-hidden="true"><use href="#icon-tag"></use></svg>Bin ' +
    esc(bin) +
    "</span>";

  const head = (title, sub, control = "") =>
    '<div class="sectionhead"><div><h2>' +
    title +
    "</h2><small>" +
    sub +
    "</small></div>" +
    control +
    "</div>";

  // ---------------------------------------------------------------------------
  // View: Requests & Batch Issue Form
  // ---------------------------------------------------------------------------
  function requestPage() {
    let html = head(
      "Approved requests",
      "Student Activities Office · 3 approved forms",
    );

    if (s.selected) {
      const r = getReq(s.selected);
      const reqStatus = getRequestStatus(r.id);
      const reqLoans = s.loans.filter((l) => l.req === r.id);
      const activeLoans = reqLoans.filter((l) => !l.back);
      const returnedLoans = reqLoans.filter((l) => l.back);

      html +=
        '<div style="margin-bottom: var(--space-3);">' +
        btn("← Back to requests", "close", "", "btn-ghost") +
        "</div>" +
        '<div class="request-detail-box">' +
        '<div class="request-card-header">' +
        '<span class="request-id-badge">' +
        esc(r.id) +
        "</span>" +
        "<h3>" +
        esc(r.event) +
        "</h3>" +
        '<span class="badge ' +
        reqStatus.badge +
        '">' +
        esc(reqStatus.label) +
        "</span>" +
        "</div>" +
        '<div class="request-meta-line">' +
        "<strong>" +
        esc(r.club) +
        "</strong> · Filed by " +
        esc(r.owner) +
        " · Approved return by <strong>" +
        esc(r.due) +
        "</strong>" +
        "</div>" +
        '<div class="request-callout">' +
        "<strong>Request note:</strong> " +
        esc(r.note) +
        (r.id === "RQ-214"
          ? '<div class="ticket-note-callout" style="margin-top:6px;"><svg class="store-icon"><use href="#icon-messages-square"></use></svg><span>Desk book notice: Isha Rao requested the kit be issued to <strong>Kabir Sen</strong>.</span></div>'
          : "") +
        "</div>";

      // Approved Equipment Items & Batch Issuing Builder
      const itemsToIssue = [];
      const issuedItems = [];

      r.items.forEach((itemType) => {
        const existingLoan = activeLoans.find(
          (l) => getAsset(l.asset).type === itemType,
        );
        if (existingLoan) {
          issuedItems.push({ type: itemType, loan: existingLoan });
        } else {
          itemsToIssue.push(itemType);
        }
      });

      html += '<div class="kit-builder">';
      html +=
        "<div><h4 style='font-size: var(--text-sm); font-weight: 700;'>Approved Equipment Units (" +
        r.items.length +
        " items)</h4><small>Verify serials and physical bin locations before handing over.</small></div>";

      // Form for Batch Issuing
      if (itemsToIssue.length > 0) {
        // Collect candidate assets for each unissued item
        const itemPicks = [];
        let canIssueAll = true;

        itemsToIssue.forEach((type) => {
          const matching = assets.filter(
            (a) => a.type === type && !a.repair && !out(a.id),
          );
          if (matching.length === 0) canIssueAll = false;
          itemPicks.push({ type, matching });
        });

        // Compute Shelf-Walk Order (sorted by bin)
        const walkList = itemPicks
          .map((p) => p.matching[0])
          .filter(Boolean)
          .sort((a, b) => a.bin.localeCompare(b.bin));

        html += '<form data-batch-issue><div class="kit-item-list">';

        itemPicks.forEach(({ type, matching }) => {
          html +=
            '<div class="kit-item-row">' +
            "<div><strong>" +
            esc(type) +
            "</strong></div>";

          if (matching.length === 0) {
            html +=
              '<div style="color: var(--danger-text); font-size: var(--text-xs);">No units available on shelf (in use or repair)</div><div></div></div>';
          } else {
            const selectHtml =
              '<select name="asset_' +
              esc(type) +
              '" required>' +
              matching
                .map(
                  (a) =>
                    '<option value="' +
                    esc(a.id) +
                    '">' +
                    esc(a.id) +
                    " · " +
                    esc(a.model) +
                    " (Bin " +
                    esc(a.bin) +
                    ")</option>",
                )
                .join("") +
              "</select>";
            html +=
              "<div>" +
              selectHtml +
              "</div><div>" +
              binChip(matching[0].bin) +
              "</div></div>";
          }
        });

        html += "</div>";

        // Collection metadata & Shelf Walk
        const defaultCollector =
          r.id === "RQ-214" ? "Kabir Sen" : r.owner;

        html +=
          '<div class="form" style="margin-top: var(--space-4);">' +
          '<label><span>Collected at counter by</span><select name="who" required>' +
          people
            .map(
              (p) =>
                '<option value="' +
                esc(p) +
                '"' +
                (p === defaultCollector ? " selected" : "") +
                ">" +
                esc(p) +
                "</option>",
            )
            .join("") +
          "</select></label>" +
          '<label><span>Return deadline</span><select name="due" required>' +
          ["Fri 8 pm", "Sat 9 am", "Sat 10 am", "Sat noon"]
            .map(
              (d) =>
                '<option value="' +
                esc(d) +
                '"' +
                (d === r.due ? " selected" : "") +
                ">" +
                esc(d) +
                "</option>",
            )
            .join("") +
          "</select></label>" +
          "</div>";

        // Pick Slip Summary (Shelf-Walk Order)
        if (walkList.length > 0) {
          html +=
            '<div class="pick-slip-summary">' +
            '<div class="walk-order">' +
            '<svg class="store-icon"><use href="#icon-map-pin"></use></svg>' +
            "<span>Shelf walk order: </span>" +
            walkList
              .map(
                (w) =>
                  "<strong>Bin " +
                  esc(w.bin) +
                  "</strong> (" +
                  esc(w.id) +
                  " · " +
                  esc(w.model) +
                  ")",
              )
              .join(' <svg class="store-icon" style="width:12px;height:12px;"><use href="#icon-arrow-right"></use></svg> ') +
            "</div>" +
            btn(
              "Print pick slip",
              "print-pick",
              "",
              "btn-sm btn-secondary",
              "Print shelf pick slip",
            ) +
            "</div>";
        }

        html +=
          '<div style="margin-top: var(--space-3); display: flex; gap: var(--space-2); align-items: center;">' +
          '<button type="submit" class="primary" ' +
          (!canIssueAll ? "disabled" : "") +
          '><svg class="store-icon"><use href="#icon-check"></use></svg> Issue approved kit (' +
          itemsToIssue.length +
          " " +
          (itemsToIssue.length === 1 ? "item" : "items") +
          ")</button>" +
          "</div></form>";
      }

      // Display already issued units
      if (issuedItems.length > 0) {
        html +=
          '<div style="margin-top: var(--space-4);"><h5 style="font-size: var(--text-xs); font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 6px;">Currently On Loan From This Request</h5>';
        issuedItems.forEach(({ type, loan }) => {
          const unit = getAsset(loan.asset);
          html +=
            '<div class="row" style="margin-bottom: 4px;">' +
            '<div class="row-left">' +
            binChip(unit.bin) +
            '<div class="row-details"><strong>' +
            esc(loan.asset) +
            " · " +
            esc(unit.model) +
            " (" +
            esc(type) +
            ")</strong><small>Slip L-" +
            loan.num +
            " · Held by " +
            esc(loan.holder || loan.who) +
            " · Due " +
            esc(loan.due) +
            "</small></div>" +
            "</div>" +
            btn("View slip", "goto-slip", String(loan.num), "btn-sm btn-secondary") +
            "</div>";
        });
        html += "</div>";
      }

      html += "</div></div>"; // end kit-builder & request-detail-box
    } else {
      // List of Approved Requests
      html += '<div class="request-card-list">';
      requests.forEach((r) => {
        const reqStatus = getRequestStatus(r.id);
        html +=
          '<article class="request-card">' +
          "<div>" +
          '<div class="request-card-header">' +
          '<span class="request-id-badge">' +
          esc(r.id) +
          "</span>" +
          "<h3>" +
          esc(r.event) +
          "</h3>" +
          '<span class="badge ' +
          reqStatus.badge +
          '">' +
          esc(reqStatus.label) +
          "</span>" +
          "</div>" +
          '<div class="request-meta-line">' +
          "<strong>" +
          esc(r.club) +
          "</strong> · Owner: " +
          esc(r.owner) +
          " · Due <strong>" +
          esc(r.due) +
          "</strong>" +
          "</div>" +
          '<div class="request-items-summary">' +
          r.items
            .map((item) => '<span class="item-chip">' + esc(item) + "</span>")
            .join("") +
          "</div>" +
          "</div>" +
          btn(
            reqStatus.code === "complete" ? "View history" : "View & Issue Kit",
            "request",
            r.id,
            reqStatus.code === "unissued" ? "primary" : "btn-secondary",
          ) +
          "</article>";
      });
      html += "</div>";
    }

    return html;
  }

  // ---------------------------------------------------------------------------
  // View: Inventory Register
  // ---------------------------------------------------------------------------
  function inventory() {
    let html = head(
      "Inventory",
      "Physical units · home shelf bins and current availability",
    );

    const onLoanCount = assets.filter((a) => out(a.id)).length;
    const onShelfCount = assets.filter((a) => !a.repair && !out(a.id)).length;

    html +=
      '<div class="buttons" style="justify-content: space-between;">' +
      '<div style="display: flex; gap: var(--space-2); align-items: center; flex-wrap: wrap;">' +
      ["All items", "On shelf", "On loan", "In repair"]
        .map(
          (filterOption) =>
            '<button type="button" data-action="filter-inv" data-val="' +
            esc(filterOption) +
            '" aria-pressed="' +
            (s.filter === filterOption) +
            '">' +
            esc(filterOption) +
            (filterOption === "On shelf" ? " (" + onShelfCount + ")" : "") +
            (filterOption === "On loan" ? " (" + onLoanCount + ")" : "") +
            "</button>",
        )
        .join("") +
      "</div>" +
      '<label><svg class="store-icon"><use href="#icon-search"></use></svg><input type="search" placeholder="Search ID, model, person…" data-inv-search value="' +
      esc(s.inventorySearch) +
      '" style="padding: 4px 8px; font-size: var(--text-xs);"></label>' +
      "</div>";

    html += '<div class="inventory-table">';
    let renderedCount = 0;

    for (const a of assets) {
      const activeLoan = out(a.id);
      const status = a.repair
        ? "In repair"
        : activeLoan
          ? "On loan"
          : "On shelf";

      if (s.filter !== "All items" && s.filter !== status) continue;

      // Text search matching
      if (s.inventorySearch) {
        const query = s.inventorySearch.toLowerCase();
        const holderText = activeLoan ? (activeLoan.holder || activeLoan.who).toLowerCase() : "";
        const match =
          a.id.toLowerCase().includes(query) ||
          a.model.toLowerCase().includes(query) ||
          a.type.toLowerCase().includes(query) ||
          a.bin.toLowerCase().includes(query) ||
          holderText.includes(query);
        if (!match) continue;
      }

      renderedCount++;
      let statusBadge = "";
      let metaDetails = a.model + " · Home Shelf";

      if (a.repair) {
        statusBadge = '<span class="tag"><svg class="store-icon"><use href="#icon-wrench"></use></svg> Workshop</span>';
        metaDetails = a.model + " · Out of service for maintenance";
      } else if (activeLoan) {
        const overdue = isOverdue(activeLoan, s.phase);
        statusBadge = overdue
          ? '<span class="badge badge-danger"><svg class="store-icon"><use href="#icon-alert-triangle"></use></svg> Overdue</span>'
          : '<span class="badge badge-warn"><svg class="store-icon"><use href="#icon-clock"></use></svg> On loan</span>';
        metaDetails =
          a.model +
          " · Held by <strong>" +
          esc(activeLoan.holder || activeLoan.who) +
          "</strong> · Due " +
          esc(activeLoan.due);
      } else {
        statusBadge = '<span class="badge badge-ok"><svg class="store-icon"><use href="#icon-check"></use></svg> On shelf</span>';
      }

      html +=
        '<div class="row">' +
        '<div class="row-left">' +
        binChip(a.bin) +
        '<div class="row-details"><strong>' +
        esc(a.id) +
        " · " +
        esc(a.type) +
        "</strong><small>" +
        metaDetails +
        "</small></div>" +
        "</div>" +
        '<div style="display: flex; gap: var(--space-2); align-items: center;">' +
        (activeLoan
          ? btn(
              "Slip L-" + activeLoan.num,
              "goto-slip",
              String(activeLoan.num),
              "btn-sm btn-secondary",
              "Jump to loan slip in register",
            )
          : "") +
        statusBadge +
        "</div>" +
        "</div>";
    }

    if (renderedCount === 0) {
      html +=
        '<div class="empty-state">' +
        '<svg class="store-icon"><use href="#icon-package"></use></svg>' +
        "<p>No inventory items match the current filter.</p>" +
        "</div>";
    }

    html += "</div>";
    return html;
  }

  // ---------------------------------------------------------------------------
  // View: Loan Register (Tickets & Slips)
  // ---------------------------------------------------------------------------
  function register() {
    let html = head(
      "Loan register",
      "One slip per physical unit · Perforated issue tickets",
      s.editing
        ? btn("Cancel issue", "cancel", "", "btn-secondary")
        : btn("⚡ New issue slip", "new", "", "primary"),
    );

    // Single Issue Slip Form
    if (s.editing) {
      const available = assets.filter((a) => !a.repair && !out(a.id));
      const select = (label, key, options, extraAttr = "") =>
        "<label><span>" +
        label +
        '</span><select name="' +
        key +
        '" required ' +
        extraAttr +
        '><option value="">Select…</option>' +
        opts(options) +
        "</select></label>";

      return (
        html +
        '<form data-issue class="reassign-drawer" style="margin-top:0;">' +
        '<h3 style="margin-bottom: var(--space-2);"><svg class="store-icon"><use href="#icon-plus"></use></svg> Issue New Physical Loan Ticket</h3>' +
        '<div class="form">' +
        select(
          "Approved request",
          "req",
          requests.map((r) => [r.id, r.id + " · " + r.club + " (" + r.event + ")"]),
          'data-issue-req-select',
        ) +
        select(
          "Physical unit (Bin location)",
          "asset",
          available.map((a) => [
            a.id,
            a.id + " · " + a.model + " [" + a.type + "] · Bin " + a.bin,
          ]),
        ) +
        select(
          "Collected at counter by",
          "who",
          people.map((p) => [p, p]),
        ) +
        select(
          "Return deadline",
          "due",
          ["Fri 8 pm", "Sat 9 am", "Sat 10 am", "Sat noon"].map((d) => [d, d]),
          'data-issue-due-select',
        ) +
        '</div><div style="display: flex; gap: var(--space-2);"><button type="submit" class="primary">Save issue slip</button>' +
        btn("Cancel", "cancel", "", "btn-secondary") +
        "</div></form>"
      );
    }

    // Filter and Scope Toggles
    const openLoansCount = s.loans.filter((l) => !l.back).length;
    const allLoansCount = s.loans.length;

    html +=
      '<div class="buttons" style="justify-content: space-between;">' +
      '<div style="display: flex; gap: var(--space-2); align-items: center;">' +
      ["Outstanding loans", "All slips"]
        .map(
          (v, i) =>
            '<button type="button" data-action="scope" data-val="' +
            i +
            '" aria-pressed="' +
            (s.onlyOpen === (i === 0)) +
            '">' +
            esc(v) +
            " (" +
            (i === 0 ? openLoansCount : allLoansCount) +
            ")</button>",
        )
        .join("") +
      "</div>" +
      '<label><svg class="store-icon"><use href="#icon-search"></use></svg><input type="search" placeholder="Search slip #, unit, holder…" data-reg-search value="' +
      esc(s.registerSearch) +
      '" style="padding: 4px 8px; font-size: var(--text-xs);"></label>' +
      "</div>";

    // Reassign Drawer (if active)
    if (s.reassigningSlip) {
      const targetSlip = s.loans.find((l) => l.num === s.reassigningSlip);
      if (targetSlip) {
        const asset = getAsset(targetSlip.asset);
        html +=
          '<form data-reassign class="reassign-drawer">' +
          '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-2);">' +
          '<h4><svg class="store-icon"><use href="#icon-user"></use></svg> Reassign Holder & Add Note · Slip L-' +
          targetSlip.num +
          " (" +
          esc(targetSlip.asset) +
          " · " +
          esc(asset.model) +
          ")</h4>" +
          btn("✕", "close-reassign", "", "btn-ghost btn-sm") +
          "</div>" +
          '<div class="form">' +
          '<label><span>Current holder</span><select name="holder" required>' +
          people
            .map(
              (p) =>
                '<option value="' +
                esc(p) +
                '"' +
                (p === (targetSlip.holder || targetSlip.who) ? " selected" : "") +
                ">" +
                esc(p) +
                "</option>",
            )
            .join("") +
          "</select></label>" +
          '<label class="full"><span>Slip note / handover details</span>' +
          '<textarea name="note" rows="2" placeholder="e.g. Leela Das has adapter, dropping at 9 am tomorrow">' +
          esc(targetSlip.note || "") +
          "</textarea></label>" +
          "</div>" +
          '<div class="quick-chips">' +
          '<span style="font-size: var(--text-2xs); color: var(--text-muted);">Quick fill:</span>' +
          '<button type="button" class="quick-chip-btn" data-action="quick-slip-note" data-val="Leela Das has adapter. Dropping at counter at 9 am tomorrow.">Leela holds adapter (drop at 9 am)</button>' +
          '<button type="button" class="quick-chip-btn" data-action="quick-slip-note" data-val="Item held overnight by club member.">Overnight hold</button>' +
          '<button type="button" class="quick-chip-btn" data-action="quick-slip-note" data-val="Returned separately from main screening kit.">Separated return</button>' +
          "</div>" +
          '<div style="display: flex; gap: var(--space-2); margin-top: var(--space-3);">' +
          '<button type="submit" class="primary">Save handover update</button>' +
          btn("Cancel", "close-reassign", "", "btn-secondary") +
          "</div></form>";
      }
    }

    // Slips List
    let shown = s.loans
      .filter((l) => !s.onlyOpen || !l.back)
      .slice()
      .reverse();

    if (s.registerSearch) {
      const qText = s.registerSearch.toLowerCase();
      shown = shown.filter((l) => {
        const unit = getAsset(l.asset);
        const holder = (l.holder || l.who).toLowerCase();
        return (
          ("l-" + l.num).includes(qText) ||
          l.asset.toLowerCase().includes(qText) ||
          unit.model.toLowerCase().includes(qText) ||
          unit.type.toLowerCase().includes(qText) ||
          l.req.toLowerCase().includes(qText) ||
          holder.includes(qText) ||
          (l.note && l.note.toLowerCase().includes(qText))
        );
      });
    }

    if (!shown.length) {
      html +=
        '<div class="empty-state">' +
        '<svg class="store-icon"><use href="#icon-book-open"></use></svg>' +
        "<p>No loan slips found in this view.</p>" +
        "</div>";
      return html;
    }

    html += '<div class="loan-ticket-list">';

    for (const l of shown) {
      const unit = getAsset(l.asset);
      const req = getReq(l.req);
      const dueInfo = getDueStatus(l, s.phase);
      const isReassigned = l.holder && l.holder !== l.who;

      html +=
        '<article class="loan-ticket' +
        (dueInfo.overdue ? " is-overdue" : "") +
        (l.back ? " is-returned" : "") +
        '">' +
        // Ticket Stub
        '<div class="ticket-stub">' +
        '<span class="ticket-number">L-' +
        l.num +
        "</span>" +
        '<button type="button" data-action="goto-req" data-val="' +
        esc(l.req) +
        '" class="ticket-req-btn" title="View request details for ' +
        esc(l.req) +
        '">' +
        esc(l.req) +
        "</button>" +
        "</div>" +
        // Ticket Body
        '<div class="ticket-body">' +
        '<div class="ticket-primary-row">' +
        '<span class="ticket-asset-id">' +
        esc(l.asset) +
        "</span>" +
        '<span class="ticket-asset-name">' +
        esc(unit.type) +
        "</span>" +
        binChip(unit.bin) +
        '<span class="ticket-model-name">(' +
        esc(unit.model) +
        ")</span>" +
        "</div>" +
        '<div class="ticket-holder-line">' +
        '<svg class="store-icon"><use href="#icon-user"></use></svg>' +
        (isReassigned
          ? 'Held by <strong>' +
            esc(l.holder) +
            '</strong> <span class="ticket-reassigned-flag">Reassigned</span> (originally ' +
            esc(l.who) +
            ")"
          : 'Collected by <strong>' + esc(l.who) + "</strong>") +
        " · " +
        esc(req.club) +
        "</div>" +
        '<div style="display: flex; gap: var(--space-2); align-items: center; margin-top: 2px;">' +
        (dueInfo.overdue
          ? '<span class="badge badge-danger"><svg class="store-icon"><use href="#icon-alert-triangle"></use></svg> ' +
            esc(dueInfo.text) +
            "</span>"
          : !l.back
            ? '<span class="badge badge-info"><svg class="store-icon"><use href="#icon-clock"></use></svg> ' +
              esc(dueInfo.text) +
              "</span>"
            : '<span class="badge badge-ok"><svg class="store-icon"><use href="#icon-check"></use></svg> Returned to shelf ' +
              esc(unit.bin) +
              "</span>") +
        "</div>" +
        (l.note
          ? '<div class="ticket-note-callout"><svg class="store-icon"><use href="#icon-info"></use></svg><span>Note: <em>"' +
            esc(l.note) +
            '"</em></span></div>'
          : "") +
        "</div>" +
        // Ticket Actions
        '<div class="ticket-actions">';

      if (l.back) {
        html +=
          btn(
            "↩ Undo return",
            "undo-return",
            String(l.num),
            "btn-sm btn-ghost",
            "Re-open this loan slip",
          );
      } else {
        html +=
          btn(
            "Record return (" + l.asset + ")",
            "return",
            String(l.num),
            "primary btn-sm",
            "Confirm return of " + unit.model + " to Bin " + unit.bin,
          ) +
          btn(
            "Reassign / Note",
            "open-reassign",
            String(l.num),
            "btn-secondary btn-sm",
            "Reassign holder or update shift note",
          );
      }

      html += "</div></article>";
    }

    html += "</div>";
    return html;
  }

  // ---------------------------------------------------------------------------
  // View: Desk Book (Counter handover & cross-linked notes)
  // ---------------------------------------------------------------------------
  function deskbook() {
    let html = head(
      "Desk book",
      "Counter messages, club pickup instructions, and handover notes",
    );

    const baseEntries = [
      [
        "Friday · 3:20 pm",
        "Isha Rao · Film Society",
        "Kabir Sen is picking up our whole screening kit. Please issue it in his name. I’m setting up in the courtyard.",
        "RQ-214",
      ],
      [
        "Friday · 3:30 pm",
        "Tara Shah · Debate Union",
        "Our microphone stays with me overnight. I’ll return it by 10 am Saturday.",
        "RQ-209",
      ],
    ];

    if (s.phase >= 1) {
      baseEntries.push([
        "Friday · 7:30 pm",
        "Kabir Sen · Film Society",
        "I brought the projector and speaker. Leela Das has our adapter. She’ll be at the counter at 9 am tomorrow.",
        "RQ-214",
      ]);
    }

    const allEntries = [...baseEntries];

    for (const n of s.notes) {
      allEntries.push([
        shifts[n.phase].time,
        "Shift handover · " + (n.author || "Counter clerk"),
        n.text,
        n.linkedReq || "",
      ]);
    }

    // Render entries in reverse chronological order
    for (const [t, author, body, linkedReq] of allEntries.slice().reverse()) {
      html +=
        '<article class="record">' +
        '<div style="display: flex; justify-content: space-between; align-items: baseline;">' +
        "<small>" +
        esc(t) +
        "</small>" +
        (linkedReq
          ? '<button type="button" data-action="goto-req" data-val="' +
            esc(linkedReq) +
            '" class="ticket-req-btn" title="View request ' +
            esc(linkedReq) +
            '">' +
            esc(linkedReq) +
            "</button>"
          : "") +
        "</div>" +
        "<h3>" +
        esc(author) +
        "</h3>" +
        "<p>" +
        esc(body) +
        "</p>" +
        "</article>";
    }

    // Handover Form with Quick Note Chips
    html +=
      '<form data-note style="margin-top: var(--space-5);">' +
      '<div class="kit-builder">' +
      '<h4 style="font-size: var(--text-sm); font-weight: 700;"><svg class="store-icon"><use href="#icon-messages-square"></use></svg> Add Handover Note for Incoming Shift</h4>' +
      '<div class="quick-chips">' +
      '<span style="font-size: var(--text-2xs); color: var(--text-muted);">Quick insert:</span>' +
      '<button type="button" class="quick-chip-btn" data-action="quick-desk-note" data-val="Leela Das holds the USB-C adapter (AD-12). Bringing it in Sat 9 am.">Leela holds AD-12 (Sat 9 am)</button>' +
      '<button type="button" class="quick-chip-btn" data-action="quick-desk-note" data-val="Partial kit returned in good order. Outstanding piece tracked on slip.">Partial kit returned</button>' +
      '<button type="button" class="quick-chip-btn" data-action="quick-desk-note" data-val="Item verified on return. Clean and fully functional.">Verified functional</button>' +
      "</div>" +
      '<div class="form">' +
      '<label class="full"><span>Handover note</span>' +
      '<textarea name="note" rows="2" maxlength="400" placeholder="Type instructions or counter events for the next shift…" required></textarea>' +
      "</label>" +
      '<label><span>Link to approved request (optional)</span><select name="linkedReq"><option value="">None</option>' +
      requests.map((r) => '<option value="' + esc(r.id) + '">' + esc(r.id) + " · " + esc(r.club) + "</option>").join("") +
      "</select></label>" +
      "</div>" +
      '<button type="submit" class="primary"><svg class="store-icon"><use href="#icon-check"></use></svg> Add handover note</button>' +
      "</div></form>";

    return html;
  }

  const screens = {
    Requests: requestPage,
    Inventory: inventory,
    "Loan register": register,
    "Desk book": deskbook,
  };

  // ---------------------------------------------------------------------------
  // Paint Engine
  // ---------------------------------------------------------------------------
  function paint(focusSelector = null) {
    const phase = shifts[s.phase];

    // Clock
    q("[data-clock]").textContent = phase.time;

    // Shift Stepper (3-step timeline)
    const stepperContainer = q("[data-shift-stepper]");
    if (stepperContainer) {
      stepperContainer.innerHTML = shifts
        .map((sh, idx) => {
          let stepClass = "shift-step";
          if (idx === s.phase) stepClass += " active";
          else if (idx < s.phase) stepClass += " past";
          const icon =
            idx < s.phase
              ? "#icon-check"
              : idx === s.phase
                ? "#icon-clock"
                : "#icon-arrow-right";
          return (
            '<div class="' +
            stepClass +
            '">' +
            '<svg class="store-icon" style="width:12px;height:12px;"><use href="' +
            icon +
            '"></use></svg>' +
            "<span>" +
            esc(sh.shortTime) +
            "</span>" +
            "</div>" +
            (idx < shifts.length - 1 ? '<div class="shift-step-divider"></div>' : "")
          );
        })
        .join("");
    }

    q("[data-shift-title]").textContent = phase.title;
    q("[data-shift]").textContent = phase.text;

    // Advance Shift Button
    const advance = q('[data-action="advance"]');
    advance.hidden = !phase.next;
    advance.innerHTML =
      (phase.next || "") +
      ' <svg class="store-icon"><use href="#icon-arrow-right"></use></svg>';

    // Navigation Tabs with Live Counts & Indicators
    const openLoans = s.loans.filter((l) => !l.back);
    const overdueCount = openLoans.filter((l) => isOverdue(l, s.phase)).length;

    q("[data-nav]").innerHTML = pages
      .map(([n, icon]) => {
        let badgeHtml = "";
        if (n === "Requests") {
          badgeHtml = '<span class="nav-badge">3</span>';
        } else if (n === "Loan register") {
          if (overdueCount > 0) {
            badgeHtml =
              '<span class="nav-badge alert-badge" title="' +
              overdueCount +
              ' overdue loans">⚠️ ' +
              overdueCount +
              "</span>";
          } else {
            badgeHtml = '<span class="nav-badge">' + openLoans.length + "</span>";
          }
        }
        return (
          '<button type="button" data-action="tab" data-val="' +
          esc(n) +
          '" aria-pressed="' +
          (s.tab === n) +
          '"><span class="nav-title-group"><svg aria-hidden="true" class="store-icon"><use href="#icon-' +
          icon +
          '"></use></svg>' +
          esc(n) +
          "</span>" +
          badgeHtml +
          "</button>"
        );
      })
      .join("");

    // Persistent "Outstanding now" strip under the shift banner
    const strip = q("[data-outstanding-strip]");
    if (strip) {
      let metricsHtml = '<div class="strip-metrics">';
      metricsHtml +=
        '<span class="strip-metric-pill"><svg class="store-icon"><use href="#icon-package-open"></use></svg> ' +
        openLoans.length +
        " " +
        (openLoans.length === 1 ? "unit" : "units") +
        " currently out</span>";

      if (overdueCount > 0) {
        metricsHtml +=
          '<span class="strip-metric-pill has-overdue"><svg class="store-icon"><use href="#icon-alert-triangle"></use></svg> ' +
          overdueCount +
          " OVERDUE</span>";
      } else {
        metricsHtml +=
          '<span class="strip-metric-pill"><svg class="store-icon"><use href="#icon-check"></use></svg> All on time</span>';
      }
      metricsHtml += "</div>";

      // Quick mini-chips for each open loan
      let chipsHtml = '<div class="strip-chips">';
      openLoans.forEach((l) => {
        const isOd = isOverdue(l, s.phase);
        chipsHtml +=
          '<button type="button" data-action="goto-slip" data-val="' +
          l.num +
          '" class="strip-loan-chip' +
          (isOd ? " chip-overdue" : "") +
          '" title="Jump to slip L-' +
          l.num +
          '">' +
          (isOd ? "⚠️ " : "") +
          esc(l.asset) +
          " · " +
          esc(l.holder || l.who) +
          "</button>";
      });
      chipsHtml += "</div>";

      strip.innerHTML = metricsHtml + chipsHtml;
    }

    // Page Content Rendering
    const pageContainer = q("[data-page]");
    pageContainer.innerHTML = screens[s.tab]();

    // Preserve Filter Values
    if (q("[data-filter]")) q("[data-filter]").value = s.filter;

    // Status Live Region
    q("[data-status]").textContent = s.notice;

    // Focus Restoration
    if (focusSelector) {
      const el = root.querySelector(focusSelector);
      if (el) el.focus();
    }
  }

  // Toast Notification System
  function showToast(message, type = "info", undoData = null) {
    const region = q("[data-toast-region]");
    if (!region) return;

    // Clear previous toasts so notifications don't pile up
    while (region.firstChild) {
      region.removeChild(region.firstChild);
    }

    const toast = document.createElement("div");
    toast.className =
      "toast-item" +
      (type === "success"
        ? " toast-success"
        : type === "danger"
          ? " toast-danger"
          : "");

    let html = "<div>" + esc(message) + "</div>";
    if (undoData) {
      html +=
        '<button type="button" class="toast-undo-btn" data-action="undo-return" data-val="' +
        esc(undoData.slipNum) +
        '">Undo return</button>';
    }

    toast.innerHTML = html;
    region.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transition = "opacity 200ms ease";
      setTimeout(() => toast.remove(), 250);
    }, 4500);
  }

  // State Persistence
  function commit(msg, toastType = "info", undoData = null) {
    if (msg) {
      s.notice = msg;
      showToast(msg, toastType, undoData);
    }
    paint();
    try {
      localStorage.setItem(storageKey, JSON.stringify(s));
    } catch {
      q("[data-status]").textContent +=
        " Browser storage is unavailable. Progress lasts for this visit.";
    }
  }

  // ---------------------------------------------------------------------------
  // Event Delegations
  // ---------------------------------------------------------------------------
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-action]");
    if (!b) return;
    const v = b.dataset.val;

    switch (b.dataset.action) {
      case "restart":
        s = original();
        commit("Sample shift restarted. Clean start restored.");
        break;

      case "advance":
        if (s.phase < 2) s.phase++;
        s.notice = "Shift time advanced to " + shifts[s.phase].time + ".";
        commit("Shift advanced to " + shifts[s.phase].shortTime + ".");
        break;

      case "tab":
        s.tab = v;
        s.editing = false;
        s.reassigningSlip = null;
        paint(".page");
        break;

      case "close":
        s.selected = "";
        paint();
        break;

      case "request":
        s.selected = v;
        paint();
        break;

      case "new":
        s.editing = true;
        s.reassigningSlip = null;
        paint('form[data-issue] select[name="req"]');
        break;

      case "cancel":
        s.editing = false;
        paint();
        break;

      case "open-reassign":
        s.reassigningSlip = Number(v);
        paint('form[data-reassign] select[name="holder"]');
        break;

      case "close-reassign":
        s.reassigningSlip = null;
        paint();
        break;

      case "scope":
        s.onlyOpen = v === "0";
        paint();
        break;

      case "filter-inv":
        s.filter = v;
        paint();
        break;

      case "goto-slip": {
        s.tab = "Loan register";
        s.onlyOpen = false;
        s.registerSearch = "L-" + v;
        paint();
        break;
      }

      case "goto-req": {
        s.tab = "Requests";
        s.selected = v;
        paint();
        break;
      }

      case "return": {
        const l = s.loans.find((l) => l.num === Number(v));
        if (!l || l.back) return;
        l.back = true;
        s.lastReturnedSlip = l.num;
        const unit = getAsset(l.asset);
        commit(
          l.asset + " (" + unit.model + ") returned to Bin " + unit.bin + ". Slip L-" + l.num + " closed.",
          "success",
          { slipNum: l.num },
        );
        break;
      }

      case "undo-return": {
        const l = s.loans.find((l) => l.num === Number(v));
        if (!l || !l.back) return;
        l.back = false;
        s.lastReturnedSlip = null;
        commit("Return undone. Slip L-" + l.num + " reopened.", "info");
        break;
      }

      case "print-pick":
        window.print();
        break;

      case "quick-slip-note": {
        const txt = q('form[data-reassign] textarea[name="note"]');
        if (txt) {
          txt.value = v;
          txt.focus();
        }
        break;
      }

      case "quick-desk-note": {
        const txt = q('form[data-note] textarea[name="note"]');
        if (txt) {
          txt.value = v;
          txt.focus();
        }
        break;
      }
    }
  });

  // Dynamic Input / Change Handlers
  root.addEventListener("change", (e) => {
    // Inventory filter dropdown
    if (e.target.matches("[data-filter]")) {
      s.filter = e.target.value;
      commit();
      return;
    }

    // Auto-setting due on request selection in single issue form
    if (e.target.matches("[data-issue-req-select]")) {
      const selectedReq = getReq(e.target.value);
      if (selectedReq) {
        const dueSelect = q("[data-issue-due-select]");
        if (dueSelect) dueSelect.value = selectedReq.due;
      }
    }
  });

  root.addEventListener("input", (e) => {
    if (e.target.matches("[data-inv-search]")) {
      s.inventorySearch = e.target.value;
      paint();
    }
    if (e.target.matches("[data-reg-search]")) {
      s.registerSearch = e.target.value;
      paint();
    }
  });

  // Form Submissions
  root.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target;
    const form = new FormData(f);

    // 1. Handover Note Submission
    if (f.matches("[data-note]")) {
      const text = String(form.get("note") || "").trim();
      if (!text) return;
      const linkedReq = String(form.get("linkedReq") || "");
      s.notes.push({ phase: s.phase, text, linkedReq });
      commit("Handover note saved to Desk book.", "success");
      return;
    }

    // 2. Reassignment & Note Submission
    if (f.matches("[data-reassign]")) {
      const l = s.loans.find((loan) => loan.num === s.reassigningSlip);
      if (!l) return;
      const newHolder = String(form.get("holder"));
      const newNote = String(form.get("note") || "").trim();

      l.holder = newHolder;
      l.note = newNote;
      s.reassigningSlip = null;

      // Cross-link note into Desk book
      s.notes.push({
        phase: s.phase,
        text: "Slip L-" + l.num + " (" + l.asset + ") reassigned to " + newHolder + (newNote ? ': "' + newNote + '"' : ""),
        linkedReq: l.req,
      });

      commit(
        "Slip L-" + l.num + " updated. Current holder: " + newHolder + ".",
        "success",
      );
      return;
    }

    // 3. Single Issue Slip Submission
    if (f.matches("[data-issue]")) {
      const [req, asset, who, due] = ["req", "asset", "who", "due"].map((k) =>
        form.get(k),
      );
      const unit = getAsset(asset);
      const r = getReq(req);

      if (!r || !unit || unit.repair || out(asset) || !people.includes(who)) {
        showToast("Invalid unit or collector selection.", "danger");
        return;
      }
      if (!r.items.includes(unit.type)) {
        showToast(
          "This equipment type is outside the approved request.",
          "danger",
        );
        return;
      }
      if (
        s.loans.some(
          (l) =>
            l.req === req &&
            !l.back &&
            getAsset(l.asset).type === unit.type,
        )
      ) {
        showToast(
          "The approved quantity of this equipment type is already on loan.",
          "danger",
        );
        return;
      }

      const num = Math.max(400, ...s.loans.map((l) => l.num)) + 1;
      s.loans.push({
        num,
        req,
        asset,
        who,
        holder: who,
        due,
        back: false,
        note: "",
      });
      s.editing = false;
      commit(
        "Issued " + asset + " (" + unit.model + ") to " + who + " on slip L-" + num + ".",
        "success",
      );
      return;
    }

    // 4. Batch "Issue Approved Kit" Submission (Atomic)
    if (f.matches("[data-batch-issue]")) {
      const r = getReq(s.selected);
      if (!r) return;

      const who = String(form.get("who"));
      const due = String(form.get("due"));

      if (!people.includes(who)) {
        showToast("Please choose a valid collector.", "danger");
        return;
      }

      // Gather candidate units
      const unitsToIssue = [];
      const itemTypes = r.items;

      for (const itemType of itemTypes) {
        // Skip if already loaned for this request
        const alreadyOut = s.loans.find(
          (l) => l.req === r.id && !l.back && getAsset(l.asset).type === itemType,
        );
        if (alreadyOut) continue;

        const assetId = String(form.get("asset_" + itemType));
        const unit = getAsset(assetId);

        if (!unit || unit.repair || out(assetId) || unit.type !== itemType) {
          showToast(
            "Cannot issue kit: " + (unit ? unit.id : "unit") + " is unavailable.",
            "danger",
          );
          return;
        }
        unitsToIssue.push(unit);
      }

      if (unitsToIssue.length === 0) {
        showToast("All items for this request are already issued.", "info");
        return;
      }

      // Atomically allocate consecutive slip numbers
      let currentMax = Math.max(400, ...s.loans.map((l) => l.num));
      const newSlipNumbers = [];

      unitsToIssue.forEach((unit) => {
        currentMax++;
        newSlipNumbers.push(currentMax);
        s.loans.push({
          num: currentMax,
          req: r.id,
          asset: unit.id,
          who: who,
          holder: who,
          due: due,
          back: false,
          note: "",
        });
      });

      commit(
        "Successfully issued " +
          r.club +
          " kit (" +
          unitsToIssue.map((u) => u.id).join(", ") +
          ") to " +
          who +
          " on slips " +
          newSlipNumbers.map((n) => "L-" + n).join(", ") +
          ".",
        "success",
      );
    }
  });

  // ---------------------------------------------------------------------------
  // State Restore & Backward Compatibility
  // ---------------------------------------------------------------------------
  function restore(d) {
    if (
      !d ||
      d.version !== 1 ||
      !Object.hasOwn(screens, d.tab) ||
      !shifts[d.phase] ||
      (d.selected && !getReq(d.selected)) ||
      !Array.isArray(d.notes) ||
      !d.notes.every(
        (n) => n && shifts[n.phase] && typeof n.text === "string",
      ) ||
      !Array.isArray(d.loans) ||
      !d.loans.length ||
      !d.loans.every(
        (l) =>
          l && getReq(l.req) && getAsset(l.asset) && Number.isInteger(l.num),
      )
    ) {
      return;
    }

    s = {
      ...original(),
      ...d,
      loans: d.loans.map((l) => ({
        ...l,
        holder: typeof l.holder === "string" ? l.holder : l.who,
        note: typeof l.note === "string" ? l.note : "",
      })),
      notes: d.notes.map((n) => ({ ...n })),
    };
    paint();
  }

  paint();

  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) restore(JSON.parse(saved));
  } catch {
    // Keep clean initial shift on storage error or missing item
  }
})();
