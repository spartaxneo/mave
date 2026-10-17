'use strict';

/**
 * InboxZeroTriage - Autonomous Email Triage & Inbox Zero Architecture
 * 
 * Classifies inbound emails into operational tiers, extracts critical action deadlines,
 * generates context-aware 1-click executive reply options, and identifies unsubscribe candidates.
 */

class InboxZeroTriage {
  constructor(options = {}) {
    this.vipDomains = new Set((options.vipDomains || []).map(d => d.toLowerCase()));
    this.vipSenders = new Set((options.vipSenders || []).map(s => s.toLowerCase()));
  }

  addVipSender(email) {
    if (email) this.vipSenders.add(email.toLowerCase().trim());
  }

  addVipDomain(domain) {
    if (domain) this.vipDomains.add(domain.toLowerCase().trim());
  }

  triageEmail(email = {}) {
    const sender = (email.sender || '').toLowerCase().trim();
    const senderDomain = sender.split('@')[1] || '';
    const subject = email.subject || '';
    const body = email.body || '';
    const fullText = `${subject} ${body}`.toLowerCase();

    const isVip = email.isVip || this.vipSenders.has(sender) || this.vipDomains.has(senderDomain);

    let category = 'GENERAL';
    let urgencyScore = 3; // 1-10
    let requiresAction = false;
    let deadline = null;

    // 1. Promotional / Spam check
    if (/unsubscribe|click here to opt out|view in browser|special offer|discount inside|limited time sale/i.test(body)) {
      category = 'PROMOTIONAL_SPAM';
      urgencyScore = 1;
    }

    // 2. Receipts & Financial
    if (/receipt|invoice|order confirmation|payment received|billing statement|your order #|subscription renewed/i.test(subject) ||
        /amount charged|total:\s*\$\d+/i.test(body)) {
      category = 'RECEIPT_FINANCIAL';
      urgencyScore = 4;
    }

    // 3. Newsletters & Digests
    if (/daily digest|weekly newsletter|substack|the morning brew|edition #|roundup/i.test(subject)) {
      category = 'NEWSLETTER_DIGEST';
      urgencyScore = 2;
    }

    // 4. Urgent Action Detection
    const hasDeadline = /(?:by|before|deadline:?)\s*(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|eod|5pm|\d{1,2}(?:st|nd|rd|th)?\s+[a-z]+)/i.test(fullText);
    const hasUrgentKeywords = /urgent|asap|action required|immediate response|time-sensitive|action needed/i.test(subject);

    if (hasUrgentKeywords || hasDeadline) {
      category = 'URGENT_ACTION';
      urgencyScore = hasUrgentKeywords ? 9 : 8;
      requiresAction = true;

      const deadlineMatch = fullText.match(/(?:by|before|deadline:?)\s*([a-z0-9\s:]{3,20})/i);
      if (deadlineMatch) deadline = deadlineMatch[1].trim();
    } else if (isVip) {
      category = 'VIP_PERSONAL';
      urgencyScore = 8;
      requiresAction = true;
    } else if (category !== 'PROMOTIONAL_SPAM' && (/\?\s*(?:$|[A-Z])|can you|could you|please confirm|please review/i.test(body))) {
      requiresAction = true;
      urgencyScore = 6;
      category = 'ACTION_REQUEST';
    }

    // Generate executive 1-click reply options
    const quickReplies = this._generateQuickReplies(category, subject, body);

    const hasUnsubscribe = /https?:\/\/[^\s"']+unsubscribe[^\s"']*/i.test(body);
    const unsubscribeLink = hasUnsubscribe ? body.match(/https?:\/\/[^\s"']+unsubscribe[^\s"']*/i)[0] : null;

    return {
      emailId: email.id || `email_${Date.now()}`,
      sender: email.sender,
      subject: email.subject,
      category,
      urgencyScore,
      isVip,
      requiresAction,
      deadline,
      unsubscribeLink,
      recommendedAction: urgencyScore >= 8 ? 'DISPATCH_OR_REPLY_IMMEDIATELY' : category === 'PROMOTIONAL_SPAM' ? 'AUTO_ARCHIVE_OR_UNSUBSCRIBE' : 'QUEUE_FOR_DAILY_DIGEST',
      quickReplies
    };
  }

  _generateQuickReplies(category, subject, body) {
    if (category === 'PROMOTIONAL_SPAM') return [];

    if (/call|meeting|sync|interview|coffee/i.test(subject) || /call|meeting|sync/i.test(body)) {
      return [
        { label: 'Accept & Propose Time', text: 'Sounds great. I am open tomorrow between 2:00 PM and 4:00 PM EST. Let me know if that works for you.' },
        { label: 'Polite Decline', text: 'Thank you for reaching out. My calendar is currently booked solid this week, so I will have to politely pass for now.' },
        { label: 'Request Agenda First', text: 'Could you share a brief 2-bullet agenda and materials in advance so I can review before we jump on a call?' }
      ];
    }

    if (category === 'URGENT_ACTION' || category === 'ACTION_REQUEST') {
      return [
        { label: 'Acknowledge & Confirm', text: 'Confirmed. I am on it and will deliver the requested updates shortly.' },
        { label: 'Need More Context', text: 'Received. Could you clarify the exact specifications for this before I proceed?' },
        { label: 'Delegate', text: 'Received. Looping in the team to ensure this is prioritized immediately.' }
      ];
    }

    return [
      { label: 'Acknowledge Received', text: 'Thank you for the update. Received and reviewed.' },
      { label: 'Follow Up Later', text: 'Thanks for sharing. I will review this in depth and circle back by Friday.' }
    ];
  }

  summarizeDailyInbox(emails = []) {
    const triaged = emails.map(e => this.triageEmail(e));
    const urgentItems = triaged.filter(t => t.urgencyScore >= 7);
    const financial = triaged.filter(t => t.category === 'RECEIPT_FINANCIAL');
    const promotional = triaged.filter(t => t.category === 'PROMOTIONAL_SPAM');

    return {
      totalEmails: emails.length,
      urgentCount: urgentItems.length,
      receiptCount: financial.length,
      spamCount: promotional.length,
      urgentItems: urgentItems.map(u => ({ sender: u.sender, subject: u.subject, deadline: u.deadline })),
      inboxHealthRating: urgentItems.length === 0 ? 'PRISTINE_INBOX_ZERO' : urgentItems.length <= 3 ? 'MANAGEABLE' : 'ACTION_REQUIRED'
    };
  }
}

let _inboxTriage = null;
function getInboxTriage() {
  if (!_inboxTriage) {
    _inboxTriage = new InboxZeroTriage({
      vipDomains: ['google.com', 'anthropic.com', 'apple.com'],
      vipSenders: ['boss@company.com', 'partner@family.com']
    });
  }
  return _inboxTriage;
}

module.exports = { InboxZeroTriage, getInboxTriage };
