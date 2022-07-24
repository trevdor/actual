import React from 'react';
import memoizeOne from 'memoize-one';
import {
  format as formatDate,
  parse as parseDate,
  parseISO,
  isValid as isValidDate
} from 'date-fns';

import { Button, TextOneLine } from 'loot-design/src/components/common';
import { colors, styles } from 'loot-design/src/style';
import {
  integerToCurrency,
  integerToAmount,
  amountToInteger,
  groupById,
  titleFirst
} from 'loot-core/src/shared/util';
import * as monthUtils from 'loot-core/src/shared/months';
import {
  splitTransaction,
  updateTransaction,
  addSplitTransaction,
  deleteTransaction,
  realizeTempTransactions
} from 'loot-core/src/shared/transactions';

import Text from 'loot-design/src/components/Text';
import View from 'loot-design/src/components/View';
import { AmountInput } from '../util/AmountInput';
import ExitTransition from 'loot-design/src/components/mobile/ExitTransition';
import { ListItem } from 'loot-design/src/components/mobile/table';

import EditSkull1 from 'loot-design/src/svg/v2/EditSkull1';
import AlertTriangle from 'loot-design/src/svg/v2/AlertTriangle';
import Add from 'loot-design/src/svg/v1/Add';
import Trash from 'loot-design/src/svg/v1/Trash';
import PencilWriteAlternate from 'loot-design/src/svg/v2/PencilWriteAlternate';
import CalendarIcon from 'loot-design/src/svg/v2/Calendar';
import ValidationCheck from 'loot-design/src/svg/v2/ValidationCheck';
import FavoriteStar from 'loot-design/src/svg/v2/FavoriteStar';
import CheckCircle1 from 'loot-design/src/svg/v2/CheckCircle1';
import ArrowsSynchronize from 'loot-design/src/svg/v2/ArrowsSynchronize';
import {
  BooleanField,
  EDITING_PADDING,
  FieldLabel,
  InputField,
  TapField
} from '../forms';

import { useListBox, useOption } from '@react-aria/listbox';
import { useListState } from '@react-stately/list';
import { Item } from '@react-stately/collections';
import { useFocusRing } from '@react-aria/focus';
import { mergeProps } from '@react-aria/utils';
import { Section } from '@react-stately/collections';
import { useListBoxSection } from '@react-aria/listbox';
import { useSeparator } from '@react-aria/separator';

let getPayeesById = memoizeOne(payees => groupById(payees));
let getAccountsById = memoizeOne(accounts => groupById(accounts));

export function isPreviewId(id) {
  return id.indexOf('preview/') !== -1;
}

function getDescriptionPretty(transaction, payee, transferAcct) {
  let { amount } = transaction;

  if (transferAcct) {
    return `Transfer ${amount > 0 ? 'from' : 'to'} ${transferAcct.name}`;
  } else if (payee) {
    return payee.name;
  }

  return '';
}

function serializeTransaction(transaction, dateFormat) {
  let { date, amount } = transaction;
  return {
    ...transaction,
    date: formatDate(parseISO(date), dateFormat),
    amount: integerToAmount(amount || 0)
  };
}

function deserializeTransaction(transaction, originalTransaction, dateFormat) {
  let { amount, date, ...realTransaction } = transaction;

  let dayMonth = monthUtils.getDayMonthRegex(dateFormat);
  if (dayMonth.test(date)) {
    let test = parseDate(
      date,
      monthUtils.getDayMonthFormat(dateFormat),
      new Date()
    );
    if (isValidDate(test)) {
      date = monthUtils.dayFromDate(test);
    } else {
      date = null;
    }
  } else {
    let test = parseDate(date, dateFormat, new Date());
    // This is a quick sanity check to make sure something invalid
    // like "year 201" was entered
    if (test.getFullYear() > 2000 && isValidDate(test)) {
      date = monthUtils.dayFromDate(test);
    } else {
      date = null;
    }
  }

  if (date == null) {
    date =
      (originalTransaction && originalTransaction.date) ||
      monthUtils.currentDay();
  }

  return { ...realTransaction, date, amount: amountToInteger(amount || 0) };
}

function lookupName(items, id) {
  return items.find(item => item.id === id).name;
}

export class TransactionEdit extends React.Component {
  constructor(props) {
    super(props);
    this.state = { transactions: props.transactions, editingChild: null };
  }

  serializeTransactions = memoizeOne(transactions => {
    return transactions.map(t =>
      serializeTransaction(t, this.props.dateFormat)
    );
  });

  componentDidMount() {
    if (this.props.adding) {
      this.amount.focus();
    }
  }

  openChildEdit = child => {
    this.setState({ editingChild: child.id });
  };

  onAdd = () => {
    this.onSave();
  };

  onCancel = () => {
    this.props.navigation.goBack(null);
  };

  onSave = async () => {
    let { transactions } = this.state;

    if (transactions.find(t => t.account == null)) {
      // Ignore transactions if any of them don't have an account
      return;
    }

    // Since we don't own the state, we have to handle the case where
    // the user saves while editing an input. We won't have the
    // updated value so we "apply" a queued change. Maybe there's a
    // better way to do this (lift the state?)
    if (this._queuedChange) {
      let [transaction, name, value] = this._queuedChange;
      transactions = await this.onEdit(transaction, name, value);
    }

    if (this.props.adding) {
      transactions = realizeTempTransactions(transactions);
    }

    this.props.onSave(transactions);
    this.props.navigation.goBack(null);
  };

  onSaveChild = childTransaction => {
    this.setState({ editingChild: null });
  };

  onEdit = async (transaction, name, value) => {
    let { transactions } = this.state;
    let { payees } = this.props;

    let newTransaction = { ...transaction, [name]: value };
    if (this.props.onEdit) {
      newTransaction = await this.props.onEdit(newTransaction);
    }

    let { data: newTransactions } = updateTransaction(
      transactions,
      deserializeTransaction(newTransaction, null, this.props.dateFormat)
    );

    this._queuedChange = null;
    this.setState({ transactions: newTransactions });
    return newTransactions;
  };

  onQueueChange = (transaction, name, value) => {
    // This is an ugly hack to solve the problem that input's blur
    // events are not fired when unmounting. If the user has focused
    // an input and swipes back, it should still save, but because the
    // blur event is not fired we need to manually track the latest
    // change and apply it ourselves when unmounting
    this._queuedChange = [transaction, name, value];
  };

  onTap = (transactionId, name) => {
    let { navigation, dateFormat } = this.props;

    if (navigation) {
      switch (name) {
        case 'category':
          navigation.navigate('CategorySelect', {
            onSelect: id => {
              let { transactions } = this.state;
              let transaction = transactions.find(t => t.id === transactionId);
              // This is a deficiency of this API, need to fix. It
              // assumes that it receives a serialized transaction,
              // but we only have access to the raw transaction
              this.onEdit(
                serializeTransaction(transaction, dateFormat),
                name,
                id
              );
            }
          });
          break;
        case 'account':
          navigation.navigate('AccountSelect', {
            title: 'Select an account',
            onSelect: id => {
              let { transactions } = this.state;
              let transaction = transactions.find(t => t.id === transactionId);
              // See above
              this.onEdit(
                serializeTransaction(transaction, dateFormat),
                name,
                id
              );
            }
          });
          break;
        case 'payee':
          navigation.navigate('PayeeSelect', {
            onSelect: id => {
              let { transactions } = this.state;
              let transaction = transactions.find(t => t.id === transactionId);
              // See above
              this.onEdit(
                serializeTransaction(transaction, dateFormat),
                name,
                id
              );
            }
          });
          break;
        default:
      }
    }
  };

  onSplit = () => {
    this.props.navigation.navigate('CategorySelect', {
      title: 'Select the first category',
      onSelect: categoryId => {
        let transactions = this.state.transactions;

        // Split the transaction
        let { data } = splitTransaction(transactions, transactions[0].id);
        data[1].category = categoryId;

        this.setState({ transactions: data }, this.focusSplit);
      }
    });
  };

  onAddSplit = () => {
    this.props.navigation.navigate('CategorySelect', {
      title: 'Select a category',
      onSelect: categoryId => {
        let transactions = this.state.transactions;

        // Split the transaction
        let { data } = addSplitTransaction(transactions, transactions[0].id);
        // Set the initial category
        data[data.length - 1].category = categoryId;

        this.setState({ transactions: data }, this.focusSplit);
      }
    });
  };

  focusSplit = () => {
    if (this.lastChildAmount) {
      this.lastChildAmount.focus();
    }
  };

  onDeleteSplit = transaction => {
    let { transactions } = this.state;
    let { data } = deleteTransaction(transactions, transaction.id);
    this.setState({ transactions: data });
  };

  renderActions = (progress, dragX) => {
    const trans = dragX.interpolate({
      inputRange: [-101, -100, -50, 0],
      outputRange: [-6, -5, -5, 20]
    });
    return (
      <button
        onClick={this.close}
        style={{
          flex: 1,
          justifyContent: 'center',
          backgroundColor: colors.r4
        }}
      >
        <Text
          style={{
            color: 'white',
            textAlign: 'right',
            transform: [{ translateX: trans }]
          }}
        >
          Delete
        </Text>
      </button>
    );
  };

  render() {
    const {
      adding,
      categories,
      accounts,
      payees,
      renderChildEdit,
      navigation,
      onDelete
    } = this.props;
    const { editingChild } = this.state;
    const transactions = this.serializeTransactions(
      this.state.transactions || []
    );
    const [transaction, ...childTransactions] = transactions;
    const { payee: payeeId, category, account: accountId } = transaction;

    // Child transactions should always default to the signage
    // of the parent transaction
    let forcedSign = transaction.amount < 0 ? 'negative' : 'positive';

    let account = getAccountsById(accounts)[accountId];
    let payee = payees && payeeId && getPayeesById(payees)[payeeId];
    let transferAcct =
      payee &&
      payee.transfer_acct &&
      getAccountsById(accounts)[payee.transfer_acct];

    let descriptionPretty = getDescriptionPretty(
      transaction,
      payee,
      transferAcct
    );

    return (
      //   <KeyboardAvoidingView>
      <View
        style={{
          margin: 10,
          marginTop: 3,
          backgroundColor: 'white',
          flex: 1,
          borderRadius: 4,

          // This shadow make the card "pop" off of the screen below
          // it
          shadowColor: colors.n3,
          shadowOffset: { width: 0, height: 0 },
          shadowRadius: 4,
          shadowOpacity: 1
        }}
      >
        <View style={{ borderRadius: 4, overflow: 'hidden', flex: 1 }}>
          <View
            style={{
              borderBottomWidth: 1,
              borderColor: colors.n9,
              flexDirection: 'row',
              justifyContent: 'center',
              padding: 15
            }}
          >
            <TextOneLine
              centered={true}
              style={[styles.header.headerTitleStyle, { marginHorizontal: 30 }]}
            >
              {payeeId == null
                ? adding
                  ? 'New Transaction'
                  : 'Transaction'
                : descriptionPretty}
            </TextOneLine>
          </View>

          {/* <ScrollView
            ref={el => (this.scrollView = el)}
            automaticallyAdjustContentInsets={false}
            keyboardShouldPersistTaps="always"
            style={{
              backgroundColor: colors.n11,
              flexGrow: 1,
              overflow: 'hidden'
            }}
            contentContainerStyle={{ flexGrow: 1 }}
          > */}
          <View
            style={{
              alignItems: 'center',
              marginVertical: 20
            }}
          >
            <FieldLabel
              title="Amount"
              flush
              style={{ marginBottom: 0, paddingLeft: 0 }}
            />
            <AmountInput
              ref={el => (this.amount = el)}
              value={transaction.amount}
              zeroIsNegative={true}
              onBlur={value =>
                this.onEdit(transaction, 'amount', value.toString())
              }
              onChange={value =>
                this.onQueueChange(transaction, 'amount', value)
              }
              style={{ height: 37, transform: [] }}
              focusedStyle={{
                width: 'auto',
                paddingVertical: 0,
                paddingHorizontal: 10,
                minWidth: 120,
                transform: [{ translateY: -0.5 }]
              }}
              textStyle={{ fontSize: 30, textAlign: 'center' }}
            />
          </View>

          <FieldLabel title="Payee" flush />
          <TapField
            value={descriptionPretty}
            onTap={() => this.onTap(transaction.id, 'payee')}
          />

          <View>
            <FieldLabel
              title={transaction.is_parent ? 'Categories (split)' : 'Category'}
            />
            {!transaction.is_parent ? (
              <TapField
                value={category ? lookupName(categories, category) : null}
                disabled={(account && !!account.offbudget) || transferAcct}
                rightContent={
                  <Button
                    contentStyle={{
                      paddingVertical: 4,
                      paddingHorizontal: 15,
                      margin: 0
                    }}
                    onPress={this.onSplit}
                  >
                    Split
                  </Button>
                }
                onTap={() => this.onTap(transaction.id, 'category')}
              />
            ) : (
              <View>
                {childTransactions.map((child, idx) => {
                  const isLast = idx === childTransactions.length - 1;
                  return (
                    // <Swipeable
                    //   key={child.id}
                    //   renderRightActions={this.renderActions}
                    //   onSwipeableRightOpen={() => this.onDeleteSplit(child)}
                    //   rightThreshold={100}
                    // >
                    <TapField
                      value={
                        child.category
                          ? lookupName(categories, child.category)
                          : null
                      }
                      rightContent={
                        <AmountInput
                          ref={
                            isLast ? el => (this.lastChildAmount = el) : null
                          }
                          value={child.amount}
                          sign={forcedSign}
                          scrollIntoView={true}
                          buttonProps={{
                            paddingVertical: 5,
                            style: {
                              width: 80,
                              alignItems: 'flex-end'
                            }
                          }}
                          textStyle={{ fontSize: 14 }}
                          onBlur={value =>
                            this.onEdit(child, 'amount', value.toString())
                          }
                        />
                      }
                      style={{ marginTop: idx === 0 ? 0 : -1 }}
                      onTap={() => this.openChildEdit(child)}
                    />
                    // </Swipeable>
                  );
                })}

                <View
                  style={{
                    alignItems: 'flex-end',
                    marginRight: EDITING_PADDING,
                    paddingTop: 10
                  }}
                >
                  {transaction.error && (
                    <Text style={{ marginBottom: 10 }}>
                      Remaining:{' '}
                      {integerToCurrency(transaction.error.difference)}
                    </Text>
                  )}
                  <button
                    style={{
                      padding: '6px 15px'
                    }}
                    onClick={this.onAddSplit}
                  >
                    Add split
                  </button>
                </View>
              </View>
            )}
          </View>

          <FieldLabel title="Account" />
          <TapField
            disabled={!adding}
            value={account ? account.name : null}
            onTap={() => this.onTap(transaction.id, 'account')}
          />

          <View style={{ flexDirection: 'row' }}>
            <View style={{ flex: 1 }}>
              <FieldLabel title="Date" />
              <InputField
                defaultValue={transaction.date}
                onUpdate={value => this.onEdit(transaction, 'date', value)}
                onChange={e =>
                  this.onQueueChange(transaction, 'date', e.nativeEvent.text)
                }
              />
            </View>

            <View style={{ marginHorizontal: 35 }}>
              <FieldLabel title="Cleared" />
              <BooleanField
                value={transaction.cleared}
                onUpdate={value => this.onEdit(transaction, 'cleared', value)}
                style={{ marginTop: 4 }}
              />
            </View>
          </View>

          <FieldLabel title="Notes" />
          <InputField
            defaultValue={transaction.notes}
            onUpdate={value => this.onEdit(transaction, 'notes', value)}
            onChange={e =>
              this.onQueueChange(transaction, 'notes', e.nativeEvent.text)
            }
          />

          {!adding && (
            <View style={{ alignItems: 'center' }}>
              <Button
                onPress={() => onDelete()}
                style={{
                  paddingVertical: 5,
                  marginHorizontal: EDITING_PADDING,
                  marginTop: 20,
                  marginBottom: 15,
                  backgroundColor: 'transparent'
                }}
                contentStyle={{ borderWidth: 0 }}
              >
                <Trash width={17} height={17} style={{ color: colors.r4 }} />
                <Text style={{ color: colors.r4, marginLeft: 5 }}>
                  Delete transaction
                </Text>
              </Button>
            </View>
          )}
          {/* </ScrollView> */}

          <View
            style={{
              paddingHorizontal: EDITING_PADDING,
              paddingVertical: 15,
              backgroundColor: colors.n11,
              borderTopWidth: 1,
              borderColor: colors.n10
            }}
          >
            {adding ? (
              <Button onPress={() => this.onAdd()}>
                <Add width={17} height={17} style={{ color: colors.b3 }} />
                <Text
                  style={[styles.text, { color: colors.b3, marginLeft: 5 }]}
                >
                  Add transaction
                </Text>
              </Button>
            ) : (
              <Button onPress={() => this.onSave()}>
                <PencilWriteAlternate
                  style={{ width: 16, height: 16, color: colors.n1 }}
                />
                <Text
                  style={[styles.text, { marginLeft: 6, color: colors.n1 }]}
                >
                  Save changes
                </Text>
              </Button>
            )}
          </View>

          <ExitTransition
            alive={editingChild}
            withProps={{
              transaction:
                editingChild && transactions.find(t => t.id === editingChild)
            }}
          >
            {(exiting, onDone, { transaction }) =>
              renderChildEdit({
                transaction,
                exiting,
                amountSign: forcedSign,
                getCategoryName: id => (id ? lookupName(categories, id) : null),
                navigation: navigation,
                onEdit: this.onEdit,
                onStartClose: this.onSaveChild,
                onClose: onDone
              })
            }
          </ExitTransition>
        </View>
      </View>
      //   </KeyboardAvoidingView>
    );
  }
}

export function DateHeader({ date }) {
  return (
    <ListItem
      style={{
        height: 25,
        backgroundColor: colors.n10,
        borderColor: colors.n9,
        justifyContent: 'center'
      }}
    >
      <Text style={[styles.text, { fontSize: 13, color: colors.n4 }]}>
        {monthUtils.format(date, 'MMMM dd, yyyy')}
      </Text>
    </ListItem>
  );
}

function Status({ status }) {
  let color, backgroundColor, Icon;

  switch (status) {
    case 'missed':
      color = colors.r3;
      Icon = EditSkull1;
      break;
    case 'due':
      color = colors.y3;
      Icon = AlertTriangle;
      break;
    case 'upcoming':
      color = colors.n4;
      Icon = ArrowsSynchronize;
      break;
    default:
  }

  return (
    <Text
      style={{
        fontSize: 11,
        color,
        fontStyle: 'italic'
      }}
    >
      {titleFirst(status)}
    </Text>
  );
}

export class Transaction extends React.PureComponent {
  render() {
    const {
      transaction,
      accounts,
      categories,
      payees,
      showCategory,
      added,
      onSelect,
      style
    } = this.props;
    let {
      id,
      payee: payeeId,
      amount,
      category,
      cleared,
      is_parent,
      notes,
      schedule
    } = transaction;
    let categoryName = category ? lookupName(categories, category) : null;

    let payee = payees && payeeId && getPayeesById(payees)[payeeId];
    let transferAcct =
      payee &&
      payee.transfer_acct &&
      getAccountsById(accounts)[payee.transfer_acct];

    let prettyDescription = getDescriptionPretty(
      transaction,
      payee,
      transferAcct
    );
    let prettyCategory = transferAcct
      ? 'Transfer'
      : is_parent
      ? 'Split'
      : categoryName;

    let isPreview = isPreviewId(id);
    let textStyle = isPreview && {
      fontStyle: 'italic',
      color: colors.n5
    };
    let textStyleWithColor = [
      textStyle,
      isPreview && {
        color:
          notes === 'missed'
            ? colors.r6
            : notes === 'due'
            ? colors.y4
            : colors.n5
      }
    ];

    return (
      <button
        onClick={() => onSelect(transaction)}
        style={{ backgroundColor: 'white', '&:active': { opacity: 0.1 } }}
      >
        <ListItem
          style={[
            { flex: 1, height: 60 },
            isPreview && { backgroundColor: colors.n11 },
            style
          ]}
        >
          <View style={[{ flex: 1 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {schedule && (
                <ArrowsSynchronize
                  style={{
                    width: 12,
                    height: 12,
                    marginRight: 5,
                    color: textStyle.color || colors.n1
                  }}
                />
              )}
              <TextOneLine
                style={[
                  styles.text,
                  textStyle,
                  { fontSize: 14, fontWeight: added ? '600' : '400' },
                  prettyDescription === '' && {
                    color: colors.n6,
                    fontStyle: 'italic'
                  }
                ]}
              >
                {prettyDescription || 'Empty'}
              </TextOneLine>
            </View>
            {isPreview ? (
              <Status status={notes} />
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <CheckCircle1
                  style={{
                    width: 11,
                    height: 11,
                    color: cleared ? colors.g6 : colors.n8,
                    marginRight: 5
                  }}
                />
                {showCategory && (
                  <TextOneLine
                    style={{
                      fontSize: 11,
                      marginTop: 1,
                      fontWeight: '400',
                      color: prettyCategory ? colors.n3 : colors.p7,
                      fontStyle: prettyCategory ? null : 'italic',
                      textAlign: 'left'
                    }}
                  >
                    {prettyCategory || 'Uncategorized'}
                  </TextOneLine>
                )}
              </View>
            )}
          </View>
          <Text
            style={[
              styles.text,
              textStyle,
              { marginLeft: 25, marginRight: 5, fontSize: 14 }
            ]}
          >
            {integerToCurrency(amount)}
          </Text>
        </ListItem>
      </button>
    );
  }
}

export class TransactionList extends React.Component {
  makeData = memoizeOne(transactions => {
    // Group by date. We can assume transactions is ordered
    const sections = [];
    transactions.forEach(transaction => {
      if (
        sections.length === 0 ||
        transaction.date !== sections[sections.length - 1].date
      ) {
        // Mark the last transaction in the section so it can render
        // with a different border
        let lastSection = sections[sections.length - 1];
        if (lastSection && lastSection.data.length > 0) {
          let lastData = lastSection.data;
          lastData[lastData.length - 1].isLast = true;
        }

        sections.push({
          id: transaction.date,
          date: transaction.date,
          data: []
        });
      }

      if (!transaction.is_child) {
        sections[sections.length - 1].data.push(transaction);
      }
    });
    return sections;
  });

  renderSection({ section }) {
    return <DateHeader date={section.date} />;
  }

  renderItem = ({ item }) => {
    return (
      <Transaction
        transaction={item}
        categories={this.props.categories}
        accounts={this.props.accounts}
        payees={this.props.payees}
        showCategory={this.props.showCategory}
        added={this.props.isNew(item.id)}
        style={item.isLast && { borderColor: colors.n9 }}
        onSelect={() => this.props.onSelect(item)}
      />
    );
  };

  render() {
    const {
      transactions,
      style,
      scrollProps = {},
      onLoadMore,
      refreshControl
    } = this.props;

    return (
      //   <SectionList
      //     style={[{ flex: 1 }, style]}
      //     {...scrollProps}
      //     ListHeaderComponent={
      //       // Support pull to refresh by making sure it's always
      //       // appended and composing the props
      //       <React.Fragment>{scrollProps.ListHeaderComponent}</React.Fragment>
      //     }
      //     renderItem={this.renderItem}
      //     renderSectionHeader={this.renderSection}
      //     sections={this.makeData(transactions)}
      //     keyExtractor={item => item.id}
      //     refreshControl={refreshControl}
      //     onEndReachedThreshold={0.5}
      //     onEndReached={onLoadMore}
      //   />
      <ListBox label="Choose an option" selectionMode="multiple">
        <Section title="Section 1">
          <Item>One</Item>
          <Item>Two</Item>
          <Item>Three</Item>
        </Section>
        <Section title="Section 2">
          <Item>One</Item>
          <Item>Two</Item>
          <Item>Three</Item>
        </Section>
      </ListBox>
    );
  }
}

function ListBox(props) {
  let state = useListState(props);
  let ref = React.useRef();
  let { listBoxProps, labelProps } = useListBox(props, state, ref);

  return (
    <>
      <div {...labelProps}>{props.label}</div>
      <ul
        {...listBoxProps}
        ref={ref}
        style={{
          padding: 0,
          margin: '5px 0',
          listStyle: 'none',
          border: '1px solid gray',
          maxWidth: 250
        }}
      >
        {[...state.collection].map(item => (
          <ListBoxSection key={item.key} section={item} state={state} />
        ))}
      </ul>
    </>
  );
}

function ListBoxSection({ section, state }) {
  let { itemProps, headingProps, groupProps } = useListBoxSection({
    heading: section.rendered,
    'aria-label': section['aria-label']
  });

  let { separatorProps } = useSeparator({
    elementType: 'li'
  });

  // If the section is not the first, add a separator element.
  // The heading is rendered inside an <li> element, which contains
  // a <ul> with the child items.
  return (
    <>
      {section.key !== state.collection.getFirstKey() && (
        <li
          {...separatorProps}
          style={{
            borderTop: '1px solid gray',
            margin: '2px 5px'
          }}
        />
      )}
      <li {...itemProps}>
        {section.rendered && (
          <span
            {...headingProps}
            style={{
              fontWeight: 'bold',
              fontSize: '1.1em',
              padding: '2px 5px'
            }}
          >
            {section.rendered}
          </span>
        )}
        <ul
          {...groupProps}
          style={{
            padding: 0,
            listStyle: 'none'
          }}
        >
          {[...section.childNodes].map(node => (
            <Option key={node.key} item={node} state={state} />
          ))}
        </ul>
      </li>
    </>
  );
}

function Option({ item, state }) {
  // Get props for the option element
  let ref = React.useRef();
  let { optionProps, isSelected, isDisabled } = useOption(
    { key: item.key },
    state,
    ref
  );

  // Determine whether we should show a keyboard
  // focus ring for accessibility
  let { isFocusVisible, focusProps } = useFocusRing();

  return (
    <li
      {...mergeProps(optionProps, focusProps)}
      ref={ref}
      style={{
        background: isSelected ? 'blueviolet' : 'transparent',
        color: isSelected ? 'white' : null,
        padding: '2px 5px',
        outline: isFocusVisible ? '2px solid orange' : 'none'
      }}
    >
      {item.rendered}
    </li>
  );
}
