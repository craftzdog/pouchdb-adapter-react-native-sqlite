import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRunTests } from './useRunTests'
import { useTestList } from './useTestList'
import { TestItem } from './TestItem'
import type { SuiteResults } from './types'

const tally = (results: SuiteResults): { pass: number; fail: number } => {
  let pass = 0
  let fail = 0
  Object.values(results).forEach((suite) => {
    suite.results.forEach((r) => {
      if (r.type === 'correct') {
        pass++
      }
      if (r.type === 'incorrect') {
        fail++
      }
    })
  })
  return { pass, fail }
}

const Tests = () => {
  let totalCount = 0
  const tests = useTestList()
  const [results, runTests, running] = useRunTests()
  const { pass, fail } = tally(results)

  return (
    <View>
      <TouchableOpacity
        onPress={() => runTests()}
        disabled={running}
        style={[styles.runButton, running && styles.runButtonDisabled]}
      >
        <Text style={styles.runButtonText}>
          {running ? 'Running conformance tests…' : 'Run conformance tests'}
        </Text>
      </TouchableOpacity>

      <View style={styles.summary}>
        <Text style={[styles.summaryText, styles.pass]}>{pass} passed</Text>
        <Text style={[styles.summaryText, styles.fail]}>{fail} failed</Text>
        {running && <ActivityIndicator size={'small'} />}
      </View>

      <View style={styles.header}>
        <Text style={[styles.labelName, styles.label]} numberOfLines={1}>
          name
        </Text>
        <Text style={styles.label} numberOfLines={1}>
          pass
        </Text>
        <Text style={styles.label} numberOfLines={1}>
          fail
        </Text>
        <Text style={styles.label} numberOfLines={1}>
          total
        </Text>
      </View>
      <View>
        {Object.entries(tests).map(([suiteName, suite], index) => {
          totalCount += suite.count
          return (
            <TestItem
              key={index.toString()}
              description={suiteName}
              count={suite.count}
              results={results[suiteName]?.results || []}
            />
          )
        })}
      </View>
      <View style={styles.footer}>
        <Text style={styles.label} numberOfLines={1}>
          total
        </Text>
        <Text style={styles.totalCount}>{totalCount}</Text>
      </View>
    </View>
  )
}

export default Tests

const styles = StyleSheet.create({
  runButton: {
    padding: 10,
    marginVertical: 10,
    backgroundColor: 'navy',
    borderRadius: 4,
    alignItems: 'center',
  },
  runButtonDisabled: {
    backgroundColor: '#888',
  },
  runButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 6,
  },
  summaryText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  header: {
    width: '100%',
    paddingVertical: 5,
    flexDirection: 'row',
    alignContent: 'center',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
  },
  labelName: {
    flex: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#999',
  },
  pass: {
    color: 'green',
  },
  fail: {
    color: 'red',
  },
  footer: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  totalCount: {
    textAlign: 'right',
    fontSize: 12,
    fontWeight: 'bold',
  },
})
