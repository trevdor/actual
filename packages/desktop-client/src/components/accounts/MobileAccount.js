import React, { useEffect, useMemo, useState } from 'react';
import { connect, useDispatch, useSelector } from 'react-redux';
import { bindActionCreators } from 'redux';
import debounce from 'debounce';
import memoizeOne from 'memoize-one';
import { send, listen } from 'loot-core/src/platform/client/fetch';
import * as actions from 'loot-core/src/client/actions';
import { default as AccountDetails } from './MobileAccountDetails';
// import FocusAwareStatusBar from 'loot-design/src/components/mobile/FocusAwareStatusBar';
import * as queries from 'loot-core/src/client/queries';
import { pagedQuery } from 'loot-core/src/client/query-helpers';

import {
  getSplit,
  isPreviewId,
  ungroupTransactions
} from 'loot-core/src/shared/transactions';
import SyncRefresh from '../SyncRefresh';
import {
  SchedulesProvider,
  useCachedSchedules
} from 'loot-core/src/client/data-hooks/schedules';
import { useAccounts } from 'loot-core/src/client/data-hooks/accounts';
import { useNavigate, useSearchParams } from 'react-router-dom-v5-compat';
import {
  getCategories,
  initiallyLoadPayees
} from 'loot-core/src/client/actions';

const getSchedulesTransform = memoizeOne((id, hasSearch) => {
  let filter = queries.getAccountFilter(id, '_account');

  // Never show schedules on these pages
  if (hasSearch) {
    filter = { id: null };
  }

  return q => {
    q = q.filter({ $and: [filter, { '_account.closed': false }] });
    return q.orderBy({ next_date: 'desc' });
  };
});

function PreviewTransactions({ accountId, children }) {
  let scheduleData = useCachedSchedules();

  if (scheduleData == null) {
    return children(null);
  }

  let schedules = scheduleData.schedules.filter(
    s =>
      !s.completed &&
      ['due', 'upcoming', 'missed'].includes(scheduleData.statuses.get(s.id))
  );

  return children(
    schedules.map(schedule => ({
      id: 'preview/' + schedule.id,
      payee: schedule._payee,
      account: schedule._account,
      amount: schedule._amount,
      date: schedule.next_date,
      notes: scheduleData.statuses.get(schedule.id),
      schedule: schedule.id
    }))
  );
}

let paged;

function Account(props) {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState([]);
  const [filter, setFilter] = useState('');
  //   const [rootQuery, setRootQuery] = useState();
  const [currentQuery, setCurrentQuery] = useState();

  let state = useSelector(state => ({
    payees: state.queries.payees,
    newTransactions: state.queries.newTransactions,
    categories: state.queries.categories.list,
    prefs: state.prefs.local,
    dateFormat: state.prefs.local.dateFormat || 'MM/dd/yyyy'
  }));

  let dispatch = useDispatch();
  let actionCreators = useMemo(() => bindActionCreators(actions, dispatch), [
    dispatch
  ]);

  const { id: accountId } = props.match.params;

  //   console.log('accountId', accountId);
  //   console.log('account', account);

  const makeRootQuery = () => {
    const { id } = props.match.params || {};
    return queries.makeTransactionsQuery(id);
  };

  const updateQuery = query => {
    if (paged) {
      paged.unsubscribe();
    }

    paged = pagedQuery(
      query.options({ splits: 'grouped' }).select('*'),
      data => setTransactions(data),
      { pageCount: 150, mapper: ungroupTransactions }
    );
  };

  const fetchTransactions = async () => {
    let query = makeRootQuery();
    // setRootQuery(query);
    setCurrentQuery(query);
    updateQuery(query);
  };

  useEffect(() => {
    let unlisten;

    async function setUpAccount() {
      unlisten = listen('sync-event', ({ type, tables }) => {
        if (type === 'applied') {
          if (
            tables.includes('transactions') ||
            tables.includes('category_mapping') ||
            tables.includes('payee_mapping')
          ) {
            paged && paged.run();
          }

          if (tables.includes('payees') || tables.includes('payee_mapping')) {
            actionCreators.getPayees();
          }
        }
      });

      if (state.categories.length === 0) {
        await actionCreators.getCategories();
      }
      if (props.accounts.length === 0) {
        await actionCreators.getAccounts();
      }

      await actionCreators.initiallyLoadPayees();
      await fetchTransactions();

      actionCreators.markAccountRead(accountId);
    }

    setUpAccount();

    return () => unlisten();
  }, []);

  if (!props.accounts || !props.accounts.length || !props.match) {
    return null;
  }

  const account = props.accounts.find(acct => acct.id === accountId);

  const isNewTransaction = id => {
    return state.newTransactions.includes(id);
  };

  const onSearch = async text => {
    paged.unsubscribe();
    setFilter(text);
    onSearchDone();
  };

  const onSearchDone = debounce(() => {
    if (filter === '') {
      updateQuery(currentQuery);
    } else {
      updateQuery(
        queries.makeTransactionSearchQuery(
          currentQuery,
          filter,
          state.dateFormat
        )
      );
    }
  }, 150);

  const onSelectTransaction = transaction => {
    const { transactions } = this.state;

    if (isPreviewId(transaction.id)) {
      let parts = transaction.id.split('/');
      let scheduleId = parts[1];

      let options = ['Post transaction', 'Skip scheduled date', 'Cancel'];
      let cancelButtonIndex = 2;

      props.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex
        },
        buttonIndex => {
          switch (buttonIndex) {
            case 0:
              // Post
              send('schedule/post-transaction', { id: scheduleId });
              break;
            case 1:
              // Skip
              send('schedule/skip-next-date', { id: scheduleId });
              break;
            default:
          }
        }
      );
    } else {
      let trans = [transaction];
      if (transaction.parent_id || transaction.is_parent) {
        let index = transactions.findIndex(
          t => t.id === (transaction.parent_id || transaction.id)
        );
        trans = getSplit(transactions, index);
      }

      navigate('Transaction', {
        transactions: trans
      });
    }
  };

  const onRefresh = async () => {
    await props.syncAndDownload();
  };

  let balance = queries.accountBalance(account);
  let numberFormat = state.prefs.numberFormat || 'comma-dot';

  return (
    <SyncRefresh onSync={onRefresh}>
      {({ refreshing, onRefresh }) => (
        <SchedulesProvider
          transform={getSchedulesTransform(accountId, filter !== '')}
        >
          {/* <FocusAwareStatusBar barStyle="dark-content" animated={true} /> // TODO: how to do this on web? */}
          <PreviewTransactions accountId={props.accountId}>
            {prependTransactions =>
              prependTransactions == null ? null : (
                <AccountDetails
                  // This key forces the whole table rerender when the number
                  // format changes
                  {...state}
                  {...actionCreators}
                  key={numberFormat}
                  account={account}
                  accounts={props.accounts}
                  categories={state.categories}
                  payees={state.payees}
                  transactions={transactions}
                  prependTransactions={prependTransactions || []}
                  balance={balance}
                  isNewTransaction={isNewTransaction}
                  // refreshControl={
                  //   <RefreshControl
                  //     refreshing={refreshing}
                  //     onRefresh={onRefresh}
                  //   />
                  // }
                  onLoadMore={() => paged && paged.fetchNext()}
                  onSearch={onSearch}
                  onSelectTransaction={() => {}} // onSelectTransaction}
                />
              )
            }
          </PreviewTransactions>
        </SchedulesProvider>
      )}
    </SyncRefresh>
  );
}

export default connect(
  state => ({
    accounts: state.queries.accounts,
    newTransactions: state.queries.newTransactions,
    updatedAccounts: state.queries.updatedAccounts,
    categories: state.queries.categories.list,
    prefs: state.prefs.local
  }),
  actions
)(Account);
