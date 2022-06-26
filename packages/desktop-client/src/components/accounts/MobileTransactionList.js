import React, {
  useRef,
  useEffect,
  useCallback,
  useLayoutEffect,
  useMemo
} from 'react';
import { useDispatch } from 'react-redux';
import { TransactionTable } from './TransactionsTable';
import lively from '@jlongster/lively';
import {
  splitTransaction,
  updateTransaction,
  addSplitTransaction,
  realizeTempTransactions,
  applyTransactionDiff
} from 'loot-core/src/shared/transactions';
import { send } from 'loot-core/src/platform/client/fetch';
import { pushModal } from 'loot-core/src/client/actions/modals';
import { getChangedValues, applyChanges } from 'loot-core/src/shared/util';
import {
  useTable,
  useTableCell,
  useTableRow,
  useTableRowGroup,
  useTableHeaderRow,
  useTableColumnHeader,
  useTableSelectAllCheckbox,
  useTableSelectionCheckbox
} from '@react-aria/table';
import {
  Cell,
  Column,
  Row,
  TableBody,
  TableHeader,
  useTableState
} from '@react-stately/table';
import { useToggleState } from '@react-stately/toggle';
import { useCheckbox } from '@react-aria/checkbox';
import { VisuallyHidden } from '@react-aria/visually-hidden';
import { mergeProps } from '@react-aria/utils';
import { useFocusRing } from '@react-aria/focus';
const uuid = require('loot-core/src/platform/uuid');

// When data changes, there are two ways to update the UI:
//
// * Optimistic updates: we apply the needed updates to local data
//   and rerender immediately, and send off the changes to the
//   server. Currently, it assumes the server request is successful.
//   If it fails the user will see a generic error which isn't
//   great, but since the server is local a failure is very
//   unlikely. Still, we should notify errors better.
//
// * A full refetch and rerender: this is needed when applying
//   updates locally is too complex. Usually this happens when
//   changing a field that data is sorted on: we're not going
//   to resort the data in memory, we want to rely on the database
//   for that. So we need to do a full refresh.
//
// When writing updates, it's up to you to decide which one to do.
// Optimistic updates feel snappy, but they might show data
// differently than a full refresh. It's up to you to decide which
// one to use when doing updates.

async function saveDiff(diff) {
  let remoteUpdates = await send('transactions-batch-update', {
    ...diff,
    learnCategories: true
  });
  if (remoteUpdates.length > 0) {
    return { updates: remoteUpdates };
  }
  return {};
}

async function saveDiffAndApply(diff, changes, onChange) {
  let remoteDiff = await saveDiff(diff);
  onChange(
    applyTransactionDiff(changes.newTransaction, remoteDiff),
    applyChanges(remoteDiff, changes.data)
  );
}

export default function TransactionList({
  tableRef,
  transactions,
  allTransactions,
  loadMoreTransactions,
  account,
  accounts,
  categoryGroups,
  payees,
  balances,
  showAccount,
  headerContent,
  animated,
  isAdding,
  isNew,
  isMatched,
  isFiltered,
  dateFormat,
  addNotification,
  renderEmpty,
  onChange,
  onRefetch,
  onRefetchUpToRow,
  onCloseAddTransaction,
  onManagePayees,
  onCreatePayee
}) {
  let dispatch = useDispatch();
  let table = useRef();
  let transactionsLatest = useRef();
  let scrollTo = useRef();

  // useEffect(() => {
  //   if (scrollTo.current) {
  //     // table.current.scrollTo(scrollTo.current);
  //   }
  // }, [transactions]);

  useEffect(clearScrollTo);

  useLayoutEffect(() => {
    transactionsLatest.current = transactions;
  }, [transactions]);

  function clearScrollTo() {
    scrollTo.current = null;
  }

  let onAdd = useCallback(async newTransactions => {
    newTransactions = realizeTempTransactions(newTransactions);

    await saveDiff({ added: newTransactions });
    onRefetch();
  }, []);

  let onSave = useCallback(async transaction => {
    let changes = updateTransaction(transactionsLatest.current, transaction);

    if (changes.diff.updated.length > 0) {
      let dateChanged = !!changes.diff.updated[0].date;
      if (dateChanged) {
        // Make sure it stays at the top of the list of transactions
        // for that date
        changes.diff.updated[0].sort_order = Date.now();
        await saveDiff(changes.diff);
        onRefetch();
      } else {
        onChange(changes.newTransaction, changes.data);
        saveDiffAndApply(changes.diff, changes, onChange);
      }
    }
  }, []);

  let onAddSplit = useCallback(id => {
    const changes = addSplitTransaction(transactionsLatest.current, id);
    onChange(changes.newTransaction, changes.data);
    saveDiffAndApply(changes.diff, changes, onChange);
    return changes.diff.added[0].id;
  }, []);

  let onSplit = useCallback(id => {
    const changes = splitTransaction(transactionsLatest.current, id);
    onChange(changes.newTransaction, changes.data);
    saveDiffAndApply(changes.diff, changes, onChange);
    return changes.diff.added[0].id;
  }, []);

  let onApplyRules = useCallback(async transaction => {
    let afterRules = await send('rules-run', { transaction });
    let diff = getChangedValues(transaction, afterRules);

    let newTransaction = { ...transaction };
    if (diff) {
      Object.keys(diff).forEach(field => {
        if (
          newTransaction[field] == null ||
          newTransaction[field] === '' ||
          newTransaction[field] === 0
        ) {
          newTransaction[field] = diff[field];
        }
      });
    }
    return newTransaction;
  }, []);

  return (
    <TransactionTable
      ref={tableRef}
      transactions={allTransactions}
      loadMoreTransactions={loadMoreTransactions}
      accounts={accounts}
      categoryGroups={categoryGroups}
      payees={payees}
      balances={balances}
      showAccount={showAccount}
      showCategory={true}
      animated={animated}
      currentAccountId={account && account.id}
      isAdding={isAdding}
      isNew={isNew}
      isMatched={isMatched}
      isFiltered={isFiltered}
      dateFormat={dateFormat}
      addNotification={addNotification}
      headerContent={headerContent}
      renderEmpty={renderEmpty}
      onSave={onSave}
      onApplyRules={onApplyRules}
      onSplit={onSplit}
      onCloseAddTransaction={onCloseAddTransaction}
      onAdd={onAdd}
      onAddSplit={onAddSplit}
      onManagePayees={onManagePayees}
      onCreatePayee={onCreatePayee}
      onScroll={clearScrollTo}
      style={{ backgroundColor: 'white' }}
    />
  );
}

// function ExampleTable(props) {
//   let columns = [
//     { name: 'Name', key: 'name' },
//     { name: 'Type', key: 'type' },
//     { name: 'Date Modified', key: 'date' }
//   ];

//   let rows = [
//     { id: 1, name: 'Games', date: '6/7/2020', type: 'File folder' },
//     { id: 2, name: 'Program Files', date: '4/7/2021', type: 'File folder' },
//     { id: 3, name: 'bootmgr', date: '11/20/2010', type: 'System file' },
//     { id: 4, name: 'log.txt', date: '1/18/2016', type: 'Text Document' }
//   ];

//   return (
//     <Table aria-label="Example dynamic collection table" {...props}>
//       <TableHeader columns={columns}>
//         {column => <Column>{column.name}</Column>}
//       </TableHeader>
//       <TableBody items={rows}>
//         {item => <Row>{columnKey => <Cell>{item[columnKey]}</Cell>}</Row>}
//       </TableBody>
//     </Table>
//   );
// }

// function TableRowGroup({ type: Element, style, children }) {
//   let { rowGroupProps } = useTableRowGroup();
//   return (
//     <Element {...rowGroupProps} style={style}>
//       {children}
//     </Element>
//   );
// }

// function TableColumnHeader({ column, state }) {
//   let ref = useRef();
//   let { columnHeaderProps } = useTableColumnHeader(
//     { node: column },
//     state,
//     ref
//   );
//   let { isFocusVisible, focusProps } = useFocusRing();
//   let arrowIcon =
//     state.sortDescriptor && state.sortDescriptor.direction === 'ascending'
//       ? 'u'
//       : 'd';

//   return (
//     <th
//       {...mergeProps(columnHeaderProps, focusProps)}
//       colSpan={column.colspan}
//       style={{
//         textAlign: column.colspan > 1 ? 'center' : 'left',
//         padding: '5px 10px',
//         outline: isFocusVisible ? '2px solid orange' : 'none',
//         cursor: 'default'
//       }}
//       ref={ref}
//     >
//       {column.rendered}
//       {column.props.allowsSorting && (
//         <span
//           aria-hidden="true"
//           style={{
//             padding: '0 2px',
//             visibility:
//               state.sortDescriptor && state.sortDescriptor.column === column.key
//                 ? 'visible'
//                 : 'hidden'
//           }}
//         >
//           {arrowIcon}
//         </span>
//       )}
//     </th>
//   );
// }

// function TableSelectAllCell({ column, state }) {
//   let ref = useRef();
//   let isSingleSelectionMode = state.selectionManager.selectionMode === 'single';
//   let { columnHeaderProps } = useTableColumnHeader(
//     { node: column },
//     state,
//     ref
//   );

//   let { checkboxProps } = useTableSelectAllCheckbox(state);
//   let inputRef = useRef(null);
//   let { inputProps } = useCheckbox(
//     checkboxProps,
//     useToggleState(checkboxProps),
//     inputRef
//   );

//   return (
//     <th {...columnHeaderProps} ref={ref}>
//       {state.selectionManager.selectionMode === 'single' ? (
//         <VisuallyHidden>{inputProps['aria-label']}</VisuallyHidden>
//       ) : (
//         <input {...inputProps} ref={inputRef} />
//       )}
//     </th>
//   );
// }

// function TableCheckboxCell({ cell, state }) {
//   let ref = useRef();
//   let { gridCellProps } = useTableCell({ node: cell }, state, ref);
//   let { checkboxProps } = useTableSelectionCheckbox(
//     { key: cell.parentKey },
//     state
//   );

//   let inputRef = useRef(null);
//   let { inputProps } = useCheckbox(
//     checkboxProps,
//     useToggleState(checkboxProps),
//     inputRef
//   );

//   return (
//     <td {...gridCellProps} ref={ref}>
//       <input {...inputProps} />
//     </td>
//   );
// }

// function Table(props) {
//   let { selectionMode, selectionBehavior } = props;
//   let state = useTableState({
//     ...props,
//     showSelectionCheckboxes:
//       selectionMode === 'multiple' && selectionBehavior !== 'replace'
//   });

//   let ref = useRef();
//   let { collection } = state;
//   let { gridProps } = useTable(props, state, ref);

//   return (
//     <table {...gridProps} ref={ref} style={{ borderCollapse: 'collapse' }}>
//       <TableRowGroup
//         type="thead"
//         style={{
//           borderBottom: '2px solid var(--spectrum-global-color-gray-800)'
//         }}
//       >
//         {collection.headerRows.map(headerRow => (
//           <TableHeaderRow key={headerRow.key} item={headerRow} state={state}>
//             {[...headerRow.childNodes].map(column =>
//               column.props.isSelectionCell ? (
//                 <TableSelectAllCell
//                   key={column.key}
//                   column={column}
//                   state={state}
//                 />
//               ) : (
//                 <TableColumnHeader
//                   key={column.key}
//                   column={column}
//                   state={state}
//                 />
//               )
//             )}
//           </TableHeaderRow>
//         ))}
//       </TableRowGroup>
//       <TableRowGroup type="tbody">
//         {[...collection.body.childNodes].map(row => (
//           <TableRow key={row.key} item={row} state={state}>
//             {[...row.childNodes].map(cell =>
//               cell.props.isSelectionCell ? (
//                 <TableCheckboxCell key={cell.key} cell={cell} state={state} />
//               ) : (
//                 <TableCell key={cell.key} cell={cell} state={state} />
//               )
//             )}
//           </TableRow>
//         ))}
//       </TableRowGroup>
//     </table>
//   );
// }

// function TableHeaderRow({ item, state, children }) {
//   let ref = useRef();
//   let { rowProps } = useTableHeaderRow({ node: item }, state, ref);

//   return (
//     <tr {...rowProps} ref={ref}>
//       {children}
//     </tr>
//   );
// }

// function TableRow({ item, children, state }) {
//   let ref = useRef();
//   let isSelected = state.selectionManager.isSelected(item.key);
//   let { rowProps, isPressed } = useTableRow(
//     {
//       node: item
//     },
//     state,
//     ref
//   );
//   let { isFocusVisible, focusProps } = useFocusRing();

//   return (
//     <tr
//       style={{
//         background: isSelected
//           ? 'blueviolet'
//           : isPressed
//           ? 'var(--spectrum-global-color-gray-400)'
//           : item.index % 2
//           ? 'var(--spectrum-alias-highlight-hover)'
//           : 'none',
//         color: isSelected ? 'white' : null,
//         outline: isFocusVisible ? '2px solid orange' : 'none'
//       }}
//       {...mergeProps(rowProps, focusProps)}
//       ref={ref}
//     >
//       {children}
//     </tr>
//   );
// }

// function TableCell({ cell, state }) {
//   let ref = useRef();
//   let { gridCellProps } = useTableCell({ node: cell }, state, ref);
//   let { isFocusVisible, focusProps } = useFocusRing();

//   return (
//     <td
//       {...mergeProps(gridCellProps, focusProps)}
//       style={{
//         padding: '5px 10px',
//         outline: isFocusVisible ? '2px solid orange' : 'none',
//         cursor: 'default'
//       }}
//       ref={ref}
//     >
//       {cell.rendered}
//     </td>
//   );
// }
