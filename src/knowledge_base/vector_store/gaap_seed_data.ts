/**
 * FASB ASC codification seed data for pgvector.
 * 100+ chunks covering the most common mid-market accounting issues.
 * Each chunk has citation, section, framework, and chunk_text.
 */

import type { VectorInsertInput } from './pg_vector_store.js';

function fasb(citation: string, section: string, text: string): VectorInsertInput {
  return {
    tier: 'tier1_global',
    framework: 'FASB',
    citation,
    section,
    chunkText: `${citation} — ${section}: ${text}`,
    metadata: { source: 'FASB ASC Codification', authoritative: true },
  };
}

function ifrs(citation: string, section: string, text: string): VectorInsertInput {
  return {
    tier: 'tier1_global',
    framework: 'IFRS',
    citation,
    section,
    chunkText: `${citation} — ${section}: ${text}`,
    metadata: { source: 'IFRS Standards', authoritative: true },
  };
}

function tax(citation: string, section: string, text: string): VectorInsertInput {
  return {
    tier: 'tier1_global',
    framework: 'TAX',
    citation,
    section,
    chunkText: `${citation} — ${section}: ${text}`,
    metadata: { source: 'Internal Revenue Code', authoritative: true },
  };
}

export const GAAP_SEED_CHUNKS: VectorInsertInput[] = [
  // ────────── ASC 606: Revenue Recognition ──────────
  fasb('ASC 606-10-25-1', 'Revenue Recognition — Step 1',
    'An entity shall account for a contract with a customer only when all of the following criteria are met: (a) the parties have approved the contract, (b) each party\'s rights can be identified, (c) payment terms can be identified, (d) the contract has commercial substance, and (e) it is probable the entity will collect the consideration.'),
  fasb('ASC 606-10-25-14', 'Revenue Recognition — Performance Obligations',
    'At contract inception, an entity shall assess the goods or services promised in a contract and identify as a performance obligation each promise to transfer a distinct good or service (or bundle) to the customer.'),
  fasb('ASC 606-10-25-19', 'Revenue Recognition — Distinct Goods or Services',
    'A good or service is distinct if (a) the customer can benefit from the good or service on its own or together with other readily available resources and (b) the entity\'s promise to transfer the good or service is separately identifiable from other promises in the contract.'),
  fasb('ASC 606-10-25-23', 'Revenue Recognition — Satisfaction Over Time',
    'An entity transfers control of a good or service over time and satisfies a performance obligation over time if one of the following criteria is met: (a) the customer simultaneously receives and consumes the benefits, (b) the entity creates or enhances an asset the customer controls, or (c) the entity\'s performance does not create an asset with an alternative use and the entity has an enforceable right to payment for performance completed to date.'),
  fasb('ASC 606-10-25-27', 'Revenue Recognition — Point in Time',
    'If a performance obligation is not satisfied over time, it is satisfied at a point in time. The entity shall consider indicators of the transfer of control, including (a) present right to payment, (b) legal title, (c) physical possession, (d) risks and rewards of ownership, and (e) customer acceptance.'),
  fasb('ASC 606-10-32-2', 'Revenue Recognition — Transaction Price',
    'The transaction price is the amount of consideration to which an entity expects to be entitled in exchange for transferring promised goods or services to a customer, excluding amounts collected on behalf of third parties.'),
  fasb('ASC 606-10-32-5', 'Revenue Recognition — Variable Consideration',
    'If the consideration promised in a contract includes a variable amount, an entity shall estimate the amount of consideration to which the entity will be entitled in exchange for transferring the promised goods or services. The entity shall use either the expected value method or the most likely amount method.'),
  fasb('ASC 606-10-32-8', 'Revenue Recognition — Constraining Variable Consideration',
    'An entity shall include in the transaction price some or all of an amount of variable consideration only to the extent that it is probable that a significant reversal in the amount of cumulative revenue recognized will not occur when the uncertainty associated with the variable consideration is subsequently resolved.'),
  fasb('ASC 606-10-32-28', 'Revenue Recognition — Allocating Transaction Price',
    'The objective when allocating the transaction price is for an entity to allocate the transaction price to each performance obligation in an amount that depicts the amount of consideration to which the entity expects to be entitled in exchange for transferring the promised goods or services.'),
  fasb('ASC 606-10-25-12', 'Revenue Recognition — Contract Modifications',
    'A contract modification is a change in the scope or price (or both) of a contract that is approved by the parties to the contract. An entity shall account for a contract modification as a separate contract if (a) the scope increases because of the addition of distinct goods or services and (b) the price increases by an amount that reflects the standalone selling prices.'),

  // ────────── ASC 842: Leases ──────────
  fasb('ASC 842-10-25-1', 'Leases — Identification',
    'At inception of a contract, an entity shall determine whether the contract is, or contains, a lease. A contract is, or contains, a lease if the contract conveys the right to control the use of identified property, plant, or equipment for a period of time in exchange for consideration.'),
  fasb('ASC 842-10-25-2', 'Leases — Classification (Lessee)',
    'A lessee shall classify a lease as a finance lease when any of the following criteria are met at the commencement date: (a) ownership transfers, (b) purchase option reasonably certain, (c) lease term is for the major part of the remaining economic life, (d) present value of lease payments substantially equals fair value, or (e) the underlying asset is of such a specialized nature.'),
  fasb('ASC 842-10-25-3', 'Leases — Operating Leases',
    'A lessee shall classify a lease as an operating lease if it does not meet any of the criteria for a finance lease.'),
  fasb('ASC 842-20-25-1', 'Leases — Lessee Recognition',
    'At the commencement date, a lessee shall recognize a right-of-use asset and a lease liability. The lease liability is measured at the present value of lease payments not yet paid, discounted using the rate implicit in the lease or the lessee\'s incremental borrowing rate.'),
  fasb('ASC 842-20-30-1', 'Leases — Lessee Initial Measurement',
    'The right-of-use asset at commencement shall be measured at cost, which comprises (a) the amount of the initial measurement of the lease liability, (b) any lease payments made at or before the commencement date, less any lease incentives received, and (c) any initial direct costs incurred by the lessee.'),
  fasb('ASC 842-20-35-1', 'Leases — Lessee Subsequent Measurement',
    'After the commencement date, a lessee shall measure the lease liability by (a) increasing the carrying amount for interest on the lease liability and (b) reducing the carrying amount for lease payments made during the period.'),

  // ────────── ASC 320/326: Financial Instruments ──────────
  fasb('ASC 320-10-25-1', 'Investments — Debt Securities Classification',
    'At acquisition, an entity shall classify debt securities into three categories: held-to-maturity, trading, or available-for-sale. Classification determines measurement (amortized cost vs fair value) and where gains/losses are reported.'),
  fasb('ASC 326-20-30-1', 'Credit Losses — CECL Model',
    'An entity shall measure expected credit losses on financial assets measured at amortized cost basis on a collective (pool) basis when similar risk characteristics exist. The allowance for credit losses shall reflect management\'s current estimate of all expected credit losses over the remaining expected life of the financial asset.'),
  fasb('ASC 326-20-30-2', 'Credit Losses — Measurement Approaches',
    'Expected credit losses shall consider available information relevant to assessing the collectability of cash flows, including (a) historical loss information, (b) current conditions, and (c) reasonable and supportable forecasts.'),
  fasb('ASC 326-20-35-1', 'Credit Losses — Subsequent Measurement',
    'At each reporting date, an entity shall evaluate whether the allowance for credit losses is adequate and shall adjust the allowance through a credit loss expense (or reversal) reported in net income.'),

  // ────────── ASC 740: Income Taxes ──────────
  fasb('ASC 740-10-25-1', 'Income Taxes — Deferred Tax Assets and Liabilities',
    'A deferred tax liability or asset shall be recognized for the estimated future tax effects attributable to temporary differences and carryforwards. Deferred tax liabilities and assets are measured using the enacted tax rates expected to apply to taxable income in the periods in which the deferred tax liability or asset is expected to be settled or realized.'),
  fasb('ASC 740-10-25-6', 'Income Taxes — Recognition Threshold',
    'An entity shall recognize the financial statement benefit of a tax position only when it is more likely than not (greater than 50%) that the position will be sustained upon examination by the taxing authority, based on the technical merits of the position.'),
  fasb('ASC 740-10-30-5', 'Income Taxes — Valuation Allowance',
    'A valuation allowance shall be recognized if, based on the weight of available evidence, it is more likely than not (a likelihood of more than 50 percent) that some portion or all of the deferred tax asset will not be realized. The valuation allowance should reduce the deferred tax asset to the amount that is more likely than not to be realized.'),
  fasb('ASC 740-10-25-3', 'Income Taxes — Temporary Differences',
    'Temporary differences are differences between the tax basis of an asset or liability and its reported amount in the financial statements that will result in taxable or deductible amounts in future years when the reported amount of the asset or liability is recovered or settled.'),
  fasb('ASC 740-10-50-2', 'Income Taxes — Rate Reconciliation',
    'A public entity shall disclose a reconciliation of the reported amount of income tax expense attributable to continuing operations for the year to the amount of income tax expense that would result from applying domestic federal statutory tax rates to pretax income from continuing operations.'),

  // ────────── ASC 330: Inventory ──────────
  fasb('ASC 330-10-35-1B', 'Inventory — Lower of Cost or Net Realizable Value',
    'An entity shall measure inventory at the lower of cost or net realizable value. Net realizable value is the estimated selling price in the ordinary course of business, less reasonably predictable costs of completion, disposal, and transportation.'),
  fasb('ASC 330-10-30-1', 'Inventory — Cost Basis',
    'The primary basis of accounting for inventories is cost, which for financial accounting purposes is the price paid or consideration given to acquire an asset. Cost includes all costs of purchase, conversion, and other costs incurred in bringing the inventories to their present location and condition.'),
  fasb('ASC 330-10-35-8', 'Inventory — Write-Down',
    'When inventory has been written down below cost to net realizable value, the reduced amount is the new cost basis for subsequent inventory accounting. The write-down creates a new cost basis that is not subsequently written up.'),

  // ────────── ASC 360: Property, Plant & Equipment ──────────
  fasb('ASC 360-10-35-4', 'PP&E — Depreciation',
    'The cost of a productive facility is one of the costs of the services it renders during its useful economic life. Depreciation accounting is a system of allocating the cost of tangible capital assets over the periods expected to benefit from use of those assets.'),
  fasb('ASC 360-10-35-17', 'PP&E — Impairment Testing',
    'A long-lived asset (asset group) shall be tested for recoverability whenever events or changes in circumstances indicate that its carrying amount may not be recoverable. The carrying amount of a long-lived asset is not recoverable if it exceeds the sum of the undiscounted cash flows expected to result from the use and eventual disposition of the asset.'),
  fasb('ASC 360-10-35-21', 'PP&E — Impairment Loss',
    'An impairment loss shall be measured as the amount by which the carrying amount of a long-lived asset exceeds its fair value. The impairment loss reduces the carrying amount of the asset to its fair value, and the reduced carrying amount becomes the new cost basis.'),
  fasb('ASC 360-10-45-9', 'PP&E — Assets Held for Sale',
    'A long-lived asset classified as held for sale shall be measured at the lower of its carrying amount or fair value less cost to sell. An asset classified as held for sale shall not be depreciated while classified as held for sale.'),

  // ────────── ASC 350: Goodwill & Intangibles ──────────
  fasb('ASC 350-20-35-1', 'Goodwill — Impairment Testing',
    'An entity shall test goodwill for impairment at a reporting unit level on an annual basis and between annual tests if an event occurs or circumstances change that would more likely than not reduce the fair value of a reporting unit below its carrying amount.'),
  fasb('ASC 350-20-35-4', 'Goodwill — Quantitative Test',
    'An entity shall compare the fair value of a reporting unit with its carrying amount, including goodwill. If the carrying amount exceeds the fair value, the entity shall recognize an impairment loss in an amount equal to that excess, limited to the total amount of goodwill allocated to that reporting unit.'),
  fasb('ASC 350-30-35-1', 'Intangible Assets — Finite-Lived',
    'The cost of a recognized intangible asset with a finite useful life shall be amortized over its useful life to the entity. The method of amortization shall reflect the pattern in which the economic benefits of the intangible asset are consumed.'),
  fasb('ASC 350-30-35-18', 'Intangible Assets — Indefinite-Lived',
    'An intangible asset with an indefinite useful life shall not be amortized but shall be tested for impairment annually and between annual tests if events or changes in circumstances indicate that it is more likely than not that the asset is impaired.'),

  // ────────── ASC 820: Fair Value Measurement ──────────
  fasb('ASC 820-10-35-2', 'Fair Value — Definition',
    'Fair value is the price that would be received to sell an asset or paid to transfer a liability in an orderly transaction between market participants at the measurement date (exit price).'),
  fasb('ASC 820-10-35-37', 'Fair Value — Hierarchy Level 1',
    'Level 1 inputs are quoted prices (unadjusted) in active markets for identical assets or liabilities that the reporting entity can access at the measurement date.'),
  fasb('ASC 820-10-35-47', 'Fair Value — Hierarchy Level 2',
    'Level 2 inputs are inputs other than quoted prices included within Level 1 that are observable for the asset or liability, either directly or indirectly. Level 2 inputs include quoted prices for similar assets or liabilities in active markets, and inputs that are derived from or corroborated by observable market data.'),
  fasb('ASC 820-10-35-52', 'Fair Value — Hierarchy Level 3',
    'Level 3 inputs are unobservable inputs for the asset or liability. Unobservable inputs shall be used to measure fair value to the extent that observable inputs are not available. Level 3 inputs shall reflect the reporting entity\'s own assumptions about the assumptions that market participants would use.'),

  // ────────── ASC 450/ASC 410: Contingencies ──────────
  fasb('ASC 450-20-25-2', 'Contingencies — Loss Recognition',
    'An estimated loss from a loss contingency shall be accrued by a charge to income if (a) it is probable that an asset has been impaired or a liability has been incurred at the date of the financial statements and (b) the amount of loss can be reasonably estimated.'),
  fasb('ASC 450-20-50-3', 'Contingencies — Disclosure',
    'If no accrual is made for a loss contingency because one or both of the conditions for accrual are not met, disclosure of the contingency shall be made when there is at least a reasonable possibility that a loss may have been incurred, including the nature of the contingency and an estimate of the possible loss or range of loss.'),

  // ────────── ASC 805: Business Combinations ──────────
  fasb('ASC 805-10-25-1', 'Business Combinations — Acquisition Method',
    'An entity shall account for each business combination by applying the acquisition method. Applying the acquisition method requires: (a) identifying the acquirer, (b) determining the acquisition date, (c) recognizing and measuring the identifiable assets acquired, liabilities assumed, and any noncontrolling interest, and (d) recognizing and measuring goodwill or a gain from a bargain purchase.'),
  fasb('ASC 805-20-25-1', 'Business Combinations — Identifiable Assets',
    'The acquirer shall recognize, separately from goodwill, the identifiable assets acquired, the liabilities assumed, and any noncontrolling interest in the acquiree at the acquisition date. All identifiable assets and liabilities shall be measured at their acquisition-date fair values.'),

  // ────────── ASC 230: Statement of Cash Flows ──────────
  fasb('ASC 230-10-45-1', 'Cash Flows — Classification',
    'The statement of cash flows shall classify cash receipts and cash payments as resulting from investing, financing, or operating activities. Operating activities include all transactions and other events that are not investing or financing activities.'),
  fasb('ASC 230-10-45-16', 'Cash Flows — Operating Activities',
    'Cash flows from operating activities shall be reported using the direct or indirect method. Under the indirect method, net income is adjusted for the effects of (a) transactions of a noncash nature, (b) deferrals or accruals of past or future operating cash receipts or payments, and (c) items associated with investing or financing cash flows.'),
  fasb('ASC 230-10-45-12', 'Cash Flows — Investing Activities',
    'Investing activities include making and collecting loans and acquiring and disposing of debt or equity instruments and property, plant, and equipment and other productive assets.'),
  fasb('ASC 230-10-45-15', 'Cash Flows — Financing Activities',
    'Financing activities include obtaining resources from owners and providing them with a return on, and a return of, their investment; borrowing money and repaying amounts borrowed; and obtaining and paying for other resources obtained from creditors on long-term credit.'),

  // ────────── ASC 715: Compensation — Retirement Benefits ──────────
  fasb('ASC 715-20-25-1', 'Pensions — Net Periodic Cost',
    'An employer shall recognize the net periodic pension cost of a defined benefit pension plan, which includes service cost, interest cost, expected return on plan assets, amortization of prior service cost, and gains or losses.'),

  // ────────── ASC 718: Stock Compensation ──────────
  fasb('ASC 718-10-25-2', 'Stock Compensation — Measurement',
    'The cost of employee services received in exchange for an award of equity instruments shall be measured based on the grant-date fair value of the award. That cost shall be recognized over the requisite service period (usually the vesting period).'),
  fasb('ASC 718-10-35-2', 'Stock Compensation — Subsequent Measurement',
    'Compensation cost for each period shall be based on the number of instruments for which the requisite service is rendered. Previously recognized compensation cost shall not be reversed if an employee share option (or similar instrument) expires unexercised.'),
  fasb('ASC 718-10-35-3', 'Stock Compensation — Forfeitures',
    'Forfeitures shall be estimated at the time of grant and revised in subsequent periods if actual forfeitures differ from previous estimates. An entity may elect to account for forfeitures when they occur as an accounting policy election.'),

  // ────────── ASC 815: Derivatives and Hedging ──────────
  fasb('ASC 815-10-25-1', 'Derivatives — Recognition',
    'An entity shall recognize all of its derivative instruments in the statement of financial position as either assets or liabilities and measure those instruments at fair value.'),
  fasb('ASC 815-20-25-1', 'Derivatives — Hedge Accounting',
    'A qualifying hedging relationship is designated as either a fair value hedge, a cash flow hedge, or a hedge of a net investment in a foreign operation. Hedge accounting shall be applied only if the hedging relationship is formally designated and documented at inception.'),

  // ────────── ASC 840/842: Sale-Leaseback ──────────
  fasb('ASC 842-40-25-1', 'Sale-Leaseback — Determination',
    'A sale and leaseback transaction is a transaction in which an entity (the seller-lessee) transfers an asset to another entity (the buyer-lessor) and then leases that asset back. A transfer of an asset shall be accounted for as a sale only if the transfer meets the requirements in ASC 606 to be accounted for as a sale.'),

  // ────────── ASC 250: Accounting Changes and Error Corrections ──────────
  fasb('ASC 250-10-45-1', 'Accounting Changes — Retrospective Application',
    'An entity shall apply a change in accounting principle through retrospective application to all prior periods, unless it is impracticable to determine the period-specific effects or the cumulative effect of the change.'),
  fasb('ASC 250-10-45-23', 'Error Corrections — Restatement',
    'An error in recognition, measurement, presentation, or disclosure in financial statements that is discovered in a subsequent period shall be reported as an error correction by restating the prior-period financial statements.'),

  // ────────── ASC 855: Subsequent Events ──────────
  fasb('ASC 855-10-25-1', 'Subsequent Events — Recognition',
    'An entity shall recognize in the financial statements the effects of all subsequent events that provide additional evidence about conditions that existed at the date of the balance sheet, including the estimates inherent in the process of preparing financial statements.'),
  fasb('ASC 855-10-25-3', 'Subsequent Events — Non-Recognized',
    'An entity shall not recognize subsequent events that provide evidence about conditions that did not exist at the date of the balance sheet but arose subsequent to that date. Some of these events may require disclosure.'),

  // ────────── ASC 260: Earnings Per Share ──────────
  fasb('ASC 260-10-45-2', 'EPS — Basic',
    'Basic earnings per share shall be computed by dividing income available to common stockholders (the numerator) by the weighted-average number of common shares outstanding (the denominator) during the period.'),
  fasb('ASC 260-10-45-16', 'EPS — Diluted',
    'Diluted earnings per share shall be computed similarly to basic earnings per share except that the denominator is increased to include the number of additional common shares that would have been outstanding if the dilutive potential common shares had been issued.'),

  // ────────── ASC 205: Presentation of Financial Statements ──────────
  fasb('ASC 205-10-45-1', 'Presentation — Going Concern',
    'Management shall evaluate whether there are conditions or events that raise substantial doubt about the entity\'s ability to continue as a going concern within one year after the date that the financial statements are issued.'),
  fasb('ASC 205-20-45-1', 'Presentation — Discontinued Operations',
    'A disposal of a component of an entity or group of components of an entity shall be reported in discontinued operations if the disposal represents a strategic shift that has or will have a major effect on an entity\'s operations and financial results.'),

  // ────────── ASC 275: Risks and Uncertainties ──────────
  fasb('ASC 275-10-50-1', 'Risks and Uncertainties — Nature of Operations',
    'Financial statements shall include a description of the major products or services the reporting entity sells or provides and its principal markets, including the locations of those markets.'),
  fasb('ASC 275-10-50-8', 'Risks and Uncertainties — Estimates',
    'Disclosure shall be made when it is at least reasonably possible that an estimate will change in the near term and the effect of the change would be material to the financial statements.'),

  // ────────── ASC 280: Segment Reporting ──────────
  fasb('ASC 280-10-50-1', 'Segment Reporting — Identification',
    'A public entity shall report financial and descriptive information about its reportable operating segments. Operating segments are components of an entity about which separate financial information is available that is evaluated regularly by the chief operating decision maker.'),

  // ────────── ASC 420: Exit or Disposal Cost Obligations ──────────
  fasb('ASC 420-10-25-1', 'Restructuring — Recognition',
    'A liability for a cost associated with an exit or disposal activity shall be recognized and measured initially at its fair value in the period in which the liability is incurred (not when management commits to the plan).'),

  // ────────── ASC 480: Distinguishing Liabilities from Equity ──────────
  fasb('ASC 480-10-25-4', 'Liability vs Equity — Mandatorily Redeemable',
    'A financial instrument that embodies an unconditional obligation requiring the issuer to redeem the instrument by transferring its assets at a specified or determinable date shall be classified as a liability.'),

  // ────────── ASC 505: Equity ──────────
  fasb('ASC 505-10-50-2', 'Equity — Treasury Stock',
    'An entity shall disclose separately the number of shares of treasury stock held at the end of each period. The cost method and par value method are the two generally accepted methods of recording treasury stock transactions.'),

  // ────────── ASC 840/842 Additional ──────────
  fasb('ASC 842-20-55-2', 'Leases — Short-Term Exemption',
    'A lessee may elect, as an accounting policy, not to apply the recognition requirements of ASC 842 to short-term leases (leases with a term of 12 months or less at commencement date). The lessee shall recognize lease payments on a straight-line basis over the lease term.'),

  // ────────── ASC 470: Debt ──────────
  fasb('ASC 470-10-45-1', 'Debt — Current vs Noncurrent',
    'The current liability classification is intended to include obligations that, by their terms, are due on demand or will be due on demand within one year (or operating cycle, if longer) from the balance sheet date.'),
  fasb('ASC 470-50-40-2', 'Debt — Extinguishment',
    'A debtor shall derecognize a liability if and only if it has been extinguished. A liability has been extinguished if the debtor pays the creditor and is relieved of its obligation, or the debtor is legally released from being the primary obligor.'),

  // ────────── ASC 860: Transfers and Servicing ──────────
  fasb('ASC 860-10-40-5', 'Transfers — Sale Accounting',
    'A transfer of an entire financial asset, a group of entire financial assets, or a participating interest in an entire financial asset shall be accounted for as a sale if the transferor has surrendered control over those financial assets.'),

  // ────────── IFRS Standards ──────────
  ifrs('IAS 1.15', 'Presentation — Fair Presentation',
    'Financial statements shall present fairly the financial position, financial performance, and cash flows of an entity. Fair presentation requires the faithful representation of the effects of transactions, other events, and conditions.'),
  ifrs('IAS 2.9', 'Inventories — Measurement',
    'Inventories shall be measured at the lower of cost and net realisable value.'),
  ifrs('IAS 16.30', 'Property, Plant and Equipment — Cost Model',
    'After recognition as an asset, an item of property, plant and equipment shall be carried at its cost less any accumulated depreciation and any accumulated impairment losses.'),
  ifrs('IAS 16.31', 'Property, Plant and Equipment — Revaluation Model',
    'After recognition as an asset, an item of PP&E whose fair value can be measured reliably shall be carried at a revalued amount, being its fair value at the date of the revaluation less any subsequent accumulated depreciation and subsequent accumulated impairment losses.'),
  ifrs('IAS 36.9', 'Impairment of Assets — Testing',
    'An entity shall assess at the end of each reporting period whether there is any indication that an asset may be impaired. If any such indication exists, the entity shall estimate the recoverable amount of the asset.'),
  ifrs('IAS 37.14', 'Provisions — Recognition',
    'A provision shall be recognised when (a) an entity has a present obligation as a result of a past event, (b) it is probable that an outflow of resources will be required, and (c) a reliable estimate can be made of the amount of the obligation.'),
  ifrs('IAS 38.21', 'Intangible Assets — Recognition',
    'An intangible asset shall be recognised if, and only if, (a) it is probable that the expected future economic benefits that are attributable to the asset will flow to the entity, and (b) the cost of the asset can be measured reliably.'),
  ifrs('IFRS 9.4.1.2', 'Financial Instruments — Classification',
    'A financial asset shall be measured at amortised cost if (a) the financial asset is held within a business model whose objective is to hold financial assets in order to collect contractual cash flows, and (b) the contractual terms give rise to cash flows that are solely payments of principal and interest.'),
  ifrs('IFRS 15.9', 'Revenue — Five-Step Model',
    'An entity shall recognise revenue by applying the following steps: (a) identify the contract, (b) identify the performance obligations, (c) determine the transaction price, (d) allocate the transaction price, and (e) recognise revenue when (or as) the entity satisfies a performance obligation.'),
  ifrs('IFRS 16.22', 'Leases — Lessee Recognition',
    'At the commencement date, a lessee shall recognise a right-of-use asset and a lease liability.'),
  ifrs('IAS 12.15', 'Income Taxes — Deferred Tax Liabilities',
    'A deferred tax liability shall be recognised for all taxable temporary differences, except to the extent that the deferred tax liability arises from (a) the initial recognition of goodwill or (b) the initial recognition of an asset or liability in a transaction which is not a business combination and affects neither accounting profit nor taxable profit at the time of the transaction.'),
  ifrs('IAS 10.3', 'Events After the Reporting Period — Adjusting',
    'Events after the reporting period are those events, favourable and unfavourable, that occur between the end of the reporting period and the date when the financial statements are authorised for issue. Adjusting events are those that provide evidence of conditions that existed at the end of the reporting period.'),

  // ────────── Tax Code ──────────
  tax('IRC §162(a)', 'Business Expenses',
    'There shall be allowed as a deduction all the ordinary and necessary expenses paid or incurred during the taxable year in carrying on any trade or business, including (1) a reasonable allowance for salaries or other compensation for personal services actually rendered, (2) traveling expenses, and (3) rentals or other payments.'),
  tax('IRC §163(a)', 'Interest Deduction',
    'There shall be allowed as a deduction all interest paid or accrued within the taxable year on indebtedness. Section 163(j) limits the deduction for business interest expense to 30% of adjusted taxable income.'),
  tax('IRC §167(a)', 'Depreciation',
    'There shall be allowed as a depreciation deduction a reasonable allowance for the exhaustion, wear and tear of property used in the trade or business, or of property held for the production of income.'),
  tax('IRC §168(a)', 'MACRS Depreciation',
    'Property to which this section applies shall be treated as section 167 property and the amount of the deduction shall be determined by using the applicable depreciation method, applicable recovery period, and applicable convention.'),
  tax('IRC §179', 'Expensing Election',
    'A taxpayer may elect to treat the cost of any section 179 property as an expense which is not chargeable to capital account. The maximum deduction for 2024 is $1,220,000 with a phase-out threshold beginning at $3,050,000.'),
  tax('IRC §197', 'Amortization of Intangibles',
    'A taxpayer shall be entitled to an amortization deduction of any amortizable section 197 intangible ratably over the 15-year period beginning with the month in which such intangible was acquired.'),
  tax('IRC §263(a)', 'Capital Expenditures',
    'No deduction shall be allowed for any amount paid out for new buildings or for permanent improvements or betterments made to increase the value of any property or estate. Such expenditures must be capitalized.'),
  tax('IRC §263A', 'Uniform Capitalization (UNICAP)',
    'Producers and resellers of property must capitalize all direct costs and an allocable portion of indirect costs that benefit production or resale activities. This includes storage, purchasing, handling, and general administrative costs allocable to such activities.'),
  tax('IRC §267', 'Related Party Transactions',
    'No deduction shall be allowed in respect of any loss from the sale or exchange of property between related persons. Additionally, if a deduction would otherwise be allowable, the deduction is deferred until the related payee includes the corresponding amount in gross income.'),
  tax('IRC §274', 'Entertainment and Meals',
    'No deduction shall be allowed for any activity generally considered to be entertainment, amusement, or recreation. Business meals are deductible at 50% if directly related to or associated with the active conduct of a trade or business and are not lavish or extravagant.'),
  tax('IRC §351', 'Corporate Formation',
    'No gain or loss shall be recognized if property is transferred to a corporation by one or more persons solely in exchange for stock in such corporation and immediately after the exchange such person or persons are in control (80% ownership) of the corporation.'),
  tax('IRC §461', 'Timing of Deductions',
    'The amount of any deduction shall be taken for the taxable year which is the proper taxable year under the method of accounting used in computing taxable income. For accrual method taxpayers, all events that establish the fact of the liability must have occurred and the amount must be determinable with reasonable accuracy.'),
  tax('IRC §482', 'Transfer Pricing',
    'In any case of two or more organizations owned or controlled by the same interests, the Secretary may distribute, apportion, or allocate gross income, deductions, credits, or allowances between or among such organizations as necessary to prevent evasion of taxes or clearly to reflect the income of any of such organizations.'),
  tax('IRC §704(b)', 'Partnership Allocations',
    'A partner\'s distributive share of income, gain, loss, deduction, or credit shall be determined in accordance with the partner\'s interest in the partnership if the partnership agreement does not provide for the allocation or the allocation does not have substantial economic effect.'),
  tax('IRC §743(b)', 'Partnership Basis Adjustments',
    'In the case of a transfer of an interest in a partnership by sale or exchange or upon the death of a partner, a section 754 election allows the partnership to adjust the basis of partnership property with respect to the transferee partner.'),
  tax('IRC §1031', 'Like-Kind Exchanges',
    'No gain or loss shall be recognized on the exchange of real property held for productive use in a trade or business or for investment if such property is exchanged solely for real property of like kind which is to be held either for productive use in a trade or business or for investment.'),
  tax('IRC §199A', 'QBI Deduction',
    'An individual taxpayer may deduct 20% of qualified business income from a partnership, S corporation, or sole proprietorship, subject to limitations based on W-2 wages, the unadjusted basis of qualified property, taxable income, and the type of trade or business.'),

  // ────────── ASC 350-40: Internal-Use Software Capitalization ──────────
  fasb('ASC 350-40-25-1', 'Internal-Use Software — Capitalization Criteria',
    'Costs of computer software developed or obtained for internal use shall be capitalized during the application development stage. Costs incurred during the preliminary project stage (conceptual formulation, evaluation of alternatives, determination of technology) shall be expensed as incurred. Capitalization begins when both of the following occur: (a) the preliminary project stage is completed and (b) management has authorized and committed to funding the project and it is probable that the project will be completed and used for its intended function. Capitalizable costs include external direct costs of materials and services consumed in developing or obtaining the software, payroll and payroll-related costs for employees who are directly associated with the project, and interest costs incurred while developing the software per ASC 835-20. Costs incurred during the post-implementation/operation stage, such as training, maintenance, and data conversion for ongoing operations, shall be expensed as incurred. Upgrades and enhancements that result in additional functionality shall be capitalized; general maintenance activities shall not.'),

  fasb('ASC 350-40-35-1', 'Internal-Use Software — Amortization',
    'An internal-use software asset recognized under ASC 350-40 shall be amortized on a straight-line basis over the estimated useful life of the software unless another systematic and rational basis is more representative of the pattern in which the entity expects to consume the economic benefits. The useful life shall be reassessed at each reporting period. If the software is no longer expected to provide substantive service potential, the remaining carrying amount shall be written down to residual value. Amortization shall begin when the software is substantially complete and ready for its intended use. The amortization period should consider technological obsolescence, anticipated demand changes, and expected modifications to the software over its service life.'),

  fasb('ASC 350-40-35-5', 'Internal-Use Software — Impairment',
    'Internal-use software that is no longer expected to provide substantive service potential shall be tested for impairment under ASC 360-10-35. Indicators that impairment testing may be warranted include: (a) the software is not expected to provide substantive service potential, (b) a significant change occurs in the extent or manner in which the software is used, (c) a significant change is made or will be made to the software program, (d) costs significantly exceed the amount originally expected to develop or acquire the software. When indicators are present, the entity shall compare the carrying amount of the asset to the sum of the undiscounted future cash flows expected from its use and eventual disposition. If the carrying amount exceeds the undiscounted cash flows, an impairment loss equal to the excess of carrying amount over fair value shall be recognized.'),

  // ────────── ASC 420: Restructuring Costs ──────────
  fasb('ASC 420-10-25-4', 'Restructuring — Exit Activities',
    'A liability for a cost associated with an exit or disposal activity, including restructuring charges, shall be recognized and measured initially at fair value in the period in which the liability is incurred, not when management commits to the plan. A liability for one-time employee termination benefits is incurred at the communication date when the plan of termination meets specific criteria under ASC 420-10-25-4. A liability for costs to terminate a contract before the end of its term is incurred when the entity terminates the contract in accordance with the contract terms. Costs to consolidate facilities or relocate employees are recognized and measured at fair value in the period incurred. The fair value of a liability at initial recognition is the amount at which the liability could be settled in a current transaction between willing parties in an orderly market. Subsequent changes in the liability shall be measured using the credit-adjusted risk-free rate used at initial recognition. Disclosures shall include a description of the exit activity, the expected completion date, and for each major cost type the total expected amount, amounts incurred in the period, and cumulative amounts incurred to date.'),

  fasb('ASC 420-10-30-1', 'Restructuring — One-Time Termination Benefits',
    'One-time employee termination benefits provided to employees who are involuntarily terminated under a benefit arrangement that is not an ongoing benefit arrangement shall be measured at fair value at the communication date if the employees are not required to render service beyond a minimum retention period. If employees are required to render service beyond a minimum retention period in order to receive the termination benefits, the liability shall be measured initially at the communication date based on the fair value of the liability at the termination date and recognized ratably over the future service period. An ongoing benefit arrangement is one that exists at the date the plan of termination is communicated to employees and is maintained for the remaining active employees after the plan is completed. Benefits under an ongoing arrangement are accounted for under ASC 712 (nonretirement postemployment benefits), not ASC 420.'),

  // ────────── ASC 805: Business Combinations (PE-relevant detail) ──────────
  fasb('ASC 805-10-25-6', 'Business Combinations — Purchase Price Allocation',
    'The acquirer shall allocate the purchase price to the identifiable assets acquired and liabilities assumed at their acquisition-date fair values. The acquirer must identify itself by determining which combining entity obtained control of the other. Factors indicating the acquirer include: relative voting rights after the combination, existence of a large minority interest, composition of the governing body and senior management, and terms of the exchange. The measurement period during which the acquirer may adjust provisional amounts recognized at the acquisition date shall not exceed one year from the acquisition date. During the measurement period, the acquirer shall recognize adjustments to provisional amounts as if the accounting for the business combination had been completed at the acquisition date; comparative period information shall be revised accordingly. Adjustments recognized after the measurement period ends shall be recognized in the period determined, not retrospectively.'),

  fasb('ASC 805-30-25-1', 'Business Combinations — Goodwill Recognition',
    'The acquirer shall recognize goodwill as of the acquisition date, measured as the excess of (a) the aggregate of the consideration transferred, any noncontrolling interest in the acquiree, and the acquisition-date fair value of the acquirer previously held equity interest over (b) the net of the acquisition-date amounts of the identifiable assets acquired and the liabilities assumed. Goodwill represents future economic benefits arising from assets acquired in a business combination that are not individually identified and separately recognized. Goodwill is not amortized but shall be tested for impairment annually at the reporting unit level under ASC 350-20. If a bargain purchase occurs (aggregate consideration is less than net assets acquired), the acquirer shall first reassess whether all assets and liabilities have been correctly identified and measured, and then recognize any remaining excess as a gain in earnings.'),

  fasb('ASC 805-30-25-5', 'Business Combinations — Contingent Consideration',
    'Contingent consideration is an obligation of the acquirer to transfer additional assets or equity interests to the former owners of an acquiree if specified conditions are met. At the acquisition date, the acquirer shall recognize the acquisition-date fair value of contingent consideration as part of the consideration transferred. Contingent consideration classified as equity is not remeasured, and its subsequent settlement is accounted for within equity. Contingent consideration classified as a liability (or as an asset) shall be remeasured to fair value at each reporting date, with changes in fair value recognized in earnings. The classification as equity versus liability follows ASC 480 and ASC 815 principles. Earnout provisions tied to continued employment of selling shareholders may need to be evaluated as compensation cost rather than purchase consideration under ASC 805-10-55-25.'),

  // ────────── ASC 815: Derivatives and Hedging (PE-relevant detail) ──────────
  fasb('ASC 815-20-25-3', 'Hedging — Effectiveness Testing',
    'At hedge inception and on an ongoing basis, a hedging relationship must be expected to be highly effective in achieving offsetting changes in fair value or cash flows attributable to the hedged risk. Prospective (forward-looking) effectiveness testing must be performed at inception and whenever financial statements or earnings are reported. Retrospective (backward-looking) effectiveness testing measures how effective the hedging relationship has actually been during the period. Documentation at inception must include identification of the hedging instrument, the hedged item, the risk being hedged, and the method for assessing effectiveness. For cash flow hedges, the entity must specify the forecasted transaction date, nature, and expected amount. Hedge accounting shall be discontinued prospectively if the hedging relationship ceases to be highly effective, the hedging instrument expires, or the forecasted transaction is no longer probable.'),

  fasb('ASC 815-20-35-1', 'Hedging — Fair Value vs Cash Flow Treatment',
    'In a fair value hedge, the gain or loss on the hedging instrument and the gain or loss on the hedged item attributable to the hedged risk are both recognized in earnings in the same period. This achieves offset in the income statement. In a cash flow hedge, the effective portion of the gain or loss on the hedging instrument is reported as a component of other comprehensive income (OCI) and reclassified into earnings in the same period(s) during which the hedged forecasted transaction affects earnings. The ineffective portion of the gain or loss is recognized directly in earnings. When a hedged forecasted transaction results in the recognition of a nonfinancial asset or liability, amounts in accumulated OCI are reclassified into earnings in the same period(s) during which the asset or liability affects earnings (e.g., depreciation or cost of goods sold). If it becomes probable that a hedged forecasted transaction will not occur, the net gain or loss in accumulated OCI shall be reclassified immediately into earnings.'),

  // ────────── ASC 815: Derivatives and Hedging — Additional ──────────
  fasb('ASC 815-10-15-83', 'Derivatives — Scope and Definition',
    'A derivative instrument is a financial instrument or other contract with all three of the following characteristics: (a) it has one or more underlyings and one or more notional amounts or payment provisions or both, (b) it requires no initial net investment or an initial net investment that is smaller than would be required for other types of contracts that would be expected to have a similar response to changes in market factors, and (c) its terms require or permit net settlement, it can readily be settled net by a means outside the contract, or it provides for delivery of an asset that puts the recipient in a position not substantially different from net settlement. Interest rate swaps, foreign currency forwards, commodity futures, and equity options commonly meet this definition. Entities must evaluate embedded derivatives within host contracts per ASC 815-15 to determine if bifurcation and separate fair value accounting is required.'),

  fasb('ASC 815-15-25-1', 'Derivatives — Embedded Derivative Bifurcation',
    'An embedded derivative shall be separated from the host contract and accounted for as a derivative instrument per ASC 815-10 if all three conditions are met: (a) the economic characteristics and risks of the embedded derivative are not clearly and closely related to the economic characteristics and risks of the host contract, (b) the hybrid instrument is not remeasured at fair value under otherwise applicable GAAP with changes in fair value reported in earnings as they occur, and (c) a separate instrument with the same terms as the embedded derivative would be a derivative instrument subject to ASC 815. Common examples requiring bifurcation in PE portfolio companies include put options in preferred equity, conversion features in convertible debt, and contingent payment features in acquisition agreements.'),

  // ────────── Common PE Accounting Policies ──────────
  fasb('PE-POLICY-MGMT-FEE', 'PE — Management Fee Treatment',
    'Private equity fund managers typically charge management fees to portfolio companies, calculated as a percentage of committed capital, invested capital, or net asset value. Under GAAP, management fees received by the fund manager represent revenue from contracts with customers and are recognized over the service period in which the management services are provided, consistent with the performance obligation framework of ASC 606. Management fees charged to the portfolio company are operating expenses of that entity and should be classified as management fees or related party expenses in the income statement. Related party disclosures under ASC 850-10-50 are required, including the nature of the relationship, a description of the transactions, dollar amounts of the transactions, and any amounts due to or from related parties at the balance sheet date. When the PE sponsor waives or offsets management fees against transaction or monitoring fees, the net fee arrangement must be clearly disclosed.'),

  fasb('PE-POLICY-SPONSOR-ALLOC', 'PE — Sponsor Expense Allocation',
    'Transaction costs incurred by a PE sponsor in connection with an acquisition of a portfolio company include legal, advisory, due diligence, and financing fees. Under ASC 805-10-25-23, acquisition-related costs are expensed in the periods in which they are incurred and the services are received, with one exception: costs to issue debt or equity securities are recognized in accordance with other applicable GAAP (ASC 470-10 for debt issuance costs, ASC 505 for equity issuance costs). Monitoring fees and advisory fees charged by the sponsor to the portfolio company after acquisition are generally recognized as operating expenses in the period the services are provided. When a transaction closes, any break-up fees received from a failed acquisition target are recognized as other income in the period received. Expense allocation agreements between the sponsor and portfolio companies should be documented, arms-length in nature, and disclosed as related party transactions under ASC 850.'),

  fasb('PE-POLICY-PORTFOLIO-CLOSE', 'PE — Portfolio Company Close Requirements',
    'PE-backed portfolio companies must determine the appropriate level of consolidation or equity method accounting for their subsidiaries and investments. Under ASC 810-10, a reporting entity shall consolidate a variable interest entity (VIE) if it is the primary beneficiary, meaning it has both the power to direct the activities that most significantly impact the VIE economic performance and the obligation to absorb losses or right to receive benefits that could be significant to the VIE. For investments where the investor has significant influence (generally 20-50% ownership) but not control, the equity method under ASC 323-10 applies. During the financial close, portfolio companies must reconcile intercompany balances and eliminate intercompany transactions in consolidation. Management must evaluate whether the fund entity itself or a parallel fund structure triggers consolidation requirements. The close timeline for PE-backed companies is often compressed (15-20 business days), requiring robust automation of recurring journal entries, subledger reconciliations, and variance analysis.'),
];
