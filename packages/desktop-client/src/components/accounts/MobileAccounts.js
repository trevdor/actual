import React from 'react';
import { connect } from 'react-redux';
import { prettyAccountType } from 'loot-core/src/shared/accounts';
import Wallet from 'loot-design/src/svg/v1/Wallet';
import { colors, mobileStyles as styles } from 'loot-design/src/style';
import { Text, TextOneLine, View } from 'loot-design/src/components/common';
import { TransactionList } from './Transactions';
import CellValue from 'loot-design/src/components/spreadsheet/CellValue';
import * as actions from 'loot-core/src/client/actions';
import * as queries from 'loot-core/src/client/queries';

export function AccountHeader({ name, amount }) {
  return (
    <View style={{ marginTop: 40, flexDirection: 'row', marginHorizontal: 10 }}>
      <View style={{ flex: 1 }}>
        <Text
          style={[
            styles.text,
            { textTransform: 'uppercase', color: colors.n5, fontSize: 13 }
          ]}
          data-testid="name"
        >
          {name}
        </Text>
      </View>
      <CellValue
        binding={amount}
        style={[styles.text, { color: colors.n5, fontSize: 13 }]}
        type="financial"
      />
    </View>
  );
}

export function Account({
  account,
  updated,
  getBalanceQuery,
  index,
  onSelect
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: 'white',
        marginHorizontal: 10,
        marginTop: 10,
        shadowColor: '#9594A8',
        shadowOffset: { width: 0, height: 1 },
        shadowRadius: 1,
        shadowOpacity: 1,
        borderRadius: 6
      }}
    >
      <button
        onClick={() => onSelect(account.id)}
        style={{
          flexDirection: 'row',
          flex: 1,
          alignItems: 'center',
          borderRadius: 6,
          paddingHorizontal: 16,
          paddingVertical: 15,
          '&:active': {
            opacity: 0.1
          }
        }}
      >
        <View style={{ flex: 1 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center'
            }}
          >
            <TextOneLine
              style={[
                styles.text,
                {
                  fontSize: 17,
                  fontWeight: '600',
                  color: updated ? colors.b2 : colors.n2,
                  paddingRight: 30
                }
              ]}
            >
              {account.name}
            </TextOneLine>
            {account.bankId && (
              <View
                style={{
                  backgroundColor: colors.g5,
                  marginLeft: -23,
                  width: 8,
                  height: 8,
                  borderRadius: 8
                }}
              />
            )}
          </View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginTop: 4
            }}
          >
            <Text
              style={[
                styles.text,
                { fontSize: 13, lineHeight: 13, color: colors.n5 }
              ]}
            >
              {prettyAccountType(account.type)}
            </Text>
            <Wallet
              style={{
                width: 15,
                height: 15,
                color: colors.n9,
                marginLeft: 8,
                marginBottom: 2
              }}
            />
          </View>
        </View>
        <CellValue
          binding={getBalanceQuery(account)}
          type="financial"
          style={{ fontSize: 16, color: colors.n3 }}
          getStyle={value => value < 0 && { color: colors.r4 }}
        />
      </button>
    </View>
  );
}

function EmptyMessage({ onAdd }) {
  return (
    <View style={{ flex: 1, padding: 30 }}>
      <Text style={styles.text}>
        For Actual to be useful, you need to add an account. You can link an
        account to automatically download transactions, or manage it locally
        yourself.
      </Text>

      <button
        // primary
        style={{ marginTop: 20, alignSelf: 'center' }}
        onClick={onAdd}
      >
        Add Account
      </button>

      <Text style={{ marginTop: 20, color: colors.n5, lineHeight: 19 }}>
        In the future, you can add accounts using the add button in the header.
      </Text>
    </View>
  );
}

export class AccountList extends React.Component {
  isNewTransaction = id => {
    return this.props.newTransactions.includes(id);
  };

  render() {
    const {
      accounts,
      updatedAccounts,
      transactions,
      categories,
      getBalanceQuery,
      getOnBudgetBalance,
      getOffBudgetBalance,
      onAddAccount,
      onSelectAccount,
      onSelectTransaction,
      refreshControl
    } = this.props;
    const budgetedAccounts = accounts.filter(
      account => account.offbudget === 0
    );
    const offbudgetAccounts = accounts.filter(
      account => account.offbudget === 1
    );

    // If there are no accounts, show a helpful message
    if (accounts.length === 0) {
      return <EmptyMessage onAdd={onAddAccount} />;
    }

    const accountContent = (
      <View
        style={{
          backgroundColor: colors.n10,
          paddingBottom: 10
        }}
      >
        <AccountHeader name="Budgeted" amount={getOnBudgetBalance()} />
        {budgetedAccounts.map((acct, idx) => (
          <Account
            account={acct}
            index={idx}
            updated={updatedAccounts.includes(acct.id)}
            getBalanceQuery={getBalanceQuery}
            onSelect={onSelectAccount}
          />
        ))}

        <AccountHeader name="Off budget" amount={getOffBudgetBalance()} />
        {offbudgetAccounts.map((acct, idx) => (
          <Account
            account={acct}
            index={idx}
            updated={updatedAccounts.includes(acct.id)}
            getBalanceQuery={getBalanceQuery}
            onSelect={onSelectAccount}
          />
        ))}

        {/*<Label
          title="RECENT TRANSACTIONS"
          style={{
            textAlign: 'center',
            marginTop: 50,
            marginBottom: 20,
            marginLeft: 10
          }}
          />*/}
      </View>
    );

    return (
      <View style={{ flex: 1 }}>
        <TransactionList
          transactions={transactions}
          categories={categories}
          isNew={this.isNewTransaction}
          scrollProps={{
            ListHeaderComponent: accountContent
          }}
          refreshControl={refreshControl}
          onSelect={onSelectTransaction}
        />
      </View>
    );
  }
}

class Accounts extends React.Component {
  state = { transactions: [] };

  async componentDidMount() {
    if (this.props.categories.length === 0) {
      await this.props.getCategories();
    }

    this.props.getAccounts();
  }

  sync = async () => {
    await this.props.syncAndDownload();
  };

  onSelectAccount = id => {
    const account = this.props.accounts.find(acct => acct.id === id);
    this.props.navigation.navigate('Account', { id, title: account.name });
  };

  onSelectTransaction = transaction => {
    this.props.navigation.navigate('Transaction', { transaction });
  };

  render() {
    let {
      navigation,
      accounts,
      categories,
      payees,
      newTransactions,
      updatedAccounts,
      prefs
    } = this.props;
    let { transactions } = this.state;
    let numberFormat = prefs.numberFormat || 'comma-dot';

    return (
      <View style={{ flex: 1 }}>
        <AccountList
          // This key forces the whole table rerender when the number
          // format changes
          key={numberFormat}
          accounts={accounts.filter(account => !account.closed)}
          categories={categories}
          transactions={transactions || []}
          updatedAccounts={updatedAccounts}
          newTransactions={newTransactions}
          getBalanceQuery={queries.accountBalance}
          getOnBudgetBalance={queries.budgetedAccountBalance}
          getOffBudgetBalance={queries.offbudgetAccountBalance}
          onAddAccount={() => navigation.navigate('AddAccountModal')}
          onSelectAccount={this.onSelectAccount}
          onSelectTransaction={this.onSelectTransaction}
          // refreshControl={
          //   <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          // }
        />
      </View>
    );
  }
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
)(Accounts);
